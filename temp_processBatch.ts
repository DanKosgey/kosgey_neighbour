  /**
   * 2. Process a Batch of Messages from MessageBuffer.
   * This is where the AI actually runs (Costly).
   */
  private async processMessageBatch(remoteJid: string, messages: string[]) {
    // Combine messages into one context
    const fullText = messages.join('\n');

    // 0. Short Circuit: Ignore simple acks to save money & avoid loops
    const ignoredPatterns = /^(ok|okay|k|lol|lmao|haha|thanks|thx|cool|👍|✅|yes|no|yeah|yup|nope)\.?$/i;
    if (ignoredPatterns.test(fullText.trim())) {
        console.log(`⏩ Short-circuit: Ignoring non-actionable message: "${fullText}"`);
        return;
    }

    console.log(`🤖 AI Processing Batch for ${remoteJid}: "${fullText}"`);

    // 1. Check Rate Limit FIRST - Queue if limited
    if (rateLimitManager.isLimited()) {
        console.log(`⏸️ Rate limited. Queueing message from ${remoteJid} (silent mode)`);
        rateLimitManager.enqueue(remoteJid, messages);
        return; // Don't send any response to user
    }

    // 2. Get Contact
    const contact = await db.select().from(contacts).where(eq(contacts.phone, remoteJid)).then(res => res[0]);
    if (!contact) return;

    // 3. Identity Validation Logic
    let systemPrompt: string | undefined = undefined;
    let isIdentityCheck = false;

    if (!contact.isVerified) {
        const extractedName = IdentityValidator.extractNameFromMessage(fullText);

        if (extractedName) {
            console.log(`✅ Identity Discovered: ${extractedName}`);
            await db.update(contacts).set({
                confirmedName: extractedName,
                name: extractedName,
                isVerified: true,
                summary: `${contact.summary || ''}\n[Identity Confirmed: ${extractedName}]`
            }).where(eq(contacts.phone, remoteJid));
            contact.name = extractedName;
            contact.isVerified = true;
        } else {
            const currentName = contact.confirmedName || contact.originalPushname;
            const isNameValid = IdentityValidator.isValidName(currentName);

            if (!isNameValid) {
                console.log(`⚠️ Identity Check Failed. Requesting discovery.`);
                systemPrompt = IdentityValidator.getIdentityPrompt(currentName);
                isIdentityCheck = true;
            }
        }
    }

    // 4. Load History
    const historyLogs = await db.select()
        .from(messageLogs)
        .where(eq(messageLogs.contactPhone, remoteJid))
        .orderBy(desc(messageLogs.createdAt))
        .limit(10);

    const history = historyLogs.reverse().map(m => `${m.role === 'agent' ? 'Me' : 'Them'}: ${m.content}`);

    // Log User Input (Batch)
    await db.insert(messageLogs).values({
        contactPhone: remoteJid,
        role: 'user',
        content: fullText
    });

    // 5. Generate Response (with error handling)
    let geminiResponse;
    try {
        geminiResponse = await geminiService.generateReply(
            history.concat(`Them: ${fullText}`),
            `Contact Name: ${contact.name || "Unknown"}\nSummary: ${contact.summary}\nTrust Level: ${contact.trustLevel}`,
            systemPrompt
        );
    } catch (error: any) {
        // Check for rate limit error (429)
        if (error.status === 429 || error.code === 429) {
            const retryAfter = error.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
            const seconds = retryAfter ? parseInt(retryAfter) : 60;
            rateLimitManager.setRateLimited(seconds);
            rateLimitManager.enqueue(remoteJid, messages);

            // Start processing queue when limit clears
            setTimeout(() => {
                rateLimitManager.processQueue(this.processMessageBatch.bind(this));
            }, seconds * 1000);

            return; // Silent - don't notify user
        }

        // Other errors - log but don't crash
        console.error('Gemini Error:', error.message || error);
        return; // Silent failure
    }

    // 6. Handle Tool Calls (with loop prevention)
    const MAX_TOOL_DEPTH = 2;
    let toolDepth = 0;

    while (geminiResponse.type === 'tool_call' && geminiResponse.functionCall && toolDepth < MAX_TOOL_DEPTH) {
        const { name, args } = geminiResponse.functionCall;
        console.log(`🛠️ Tool Execution: ${name} (depth: ${toolDepth + 1}/${MAX_TOOL_DEPTH})`);

        // Execute Tool
        let toolResult;
        try {
            toolResult = await executeLocalTool(name, args, { contact });
        } catch (toolError: any) {
            console.error(`Tool error:`, toolError.message);
            toolResult = { result: "Unable to access calendar (Check credentials). Assuming Free." };
        }

        const toolOutputText = `[System: Tool '${name}' returned: ${JSON.stringify(toolResult)}]`;
        console.log(`🔄 Sending tool result to AI...`);

        // Get AI response to tool result
        try {
            geminiResponse = await geminiService.generateReply(
                history.concat(`Them: ${fullText}`, toolOutputText),
                `Contact Name: ${contact.name || "Unknown"}\nSummary: ${contact.summary}\nTrust Level: ${contact.trustLevel}`,
                systemPrompt
            );
        } catch (error: any) {
            if (error.status === 429 || error.code === 429) {
                const retryAfter = error.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
                const seconds = retryAfter ? parseInt(retryAfter) : 60;
                rateLimitManager.setRateLimited(seconds);
                rateLimitManager.enqueue(remoteJid, messages);
                setTimeout(() => {
                    rateLimitManager.processQueue(this.processMessageBatch.bind(this));
                }, seconds * 1000);
                return;
            }
            console.error('Gemini Error on tool response:', error.message || error);
            return;
        }

        toolDepth++;
    }

    if (toolDepth >= MAX_TOOL_DEPTH && geminiResponse.type === 'tool_call') {
        console.log(`⚠️ Max tool depth reached. Forcing text response.`);
        geminiResponse = { type: 'text', content: "I've checked that for you. Let me know if you need anything else!" };
    }

    // 7. Send Final Response
    if (geminiResponse.type === 'text' && geminiResponse.content) {
        await this.sendResponseAndLog(remoteJid, geminiResponse.content, contact, history, fullText);
    }
}
