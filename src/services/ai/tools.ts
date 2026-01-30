/**
 * Gemini Function Declarations
 * These define the "Toolbox" the AI can use.
 */

import { googleCalendar } from '../googleCalendar';
import { db } from '../../database';
import { messageLogs, contacts } from '../../database/schema';
import { ilike, desc, eq } from 'drizzle-orm';
import * as ownerTools from './ownerTools';
import { webScraper } from '../webScraper';
import { googleImageGenerationService } from '../googleImageGeneration';
import { marketingCampaigns } from '../../database/schema';

export const AI_TOOLS = [
    {
        functionDeclarations: [
            {
                name: "update_contact_info",
                description: "Update the contact's name, summary, or trust level in the database when new information is learned.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING", description: "The confirmed name of the contact." },
                        summary_addition: { type: "STRING", description: "New critical info to append to their bio (e.g. 'Is a lawyer', 'Birthday Oct 5')." },
                        trust_level: { type: "NUMBER", description: "New trust level (0-10) if changed." }
                    },
                    required: []
                }
            },
            {
                name: "check_schedule",
                description: "Check the owner's calendar alignment when asked about availability.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        day: { type: "STRING", description: "Day of the week or date to check (e.g. 'Monday', '2023-10-25')." },
                        time_range: { type: "STRING", description: "Time range (e.g. 'morning', '2pm-4pm')." }
                    },
                    required: ["day"]
                }
            },
            {
                name: "generate_image",
                description: "Generate an image based on a text prompt. Use this when the user asks for a picture, photo, drawing, or visual representation.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        prompt: { type: "STRING", description: "Detailed visual description of the image to generate." }
                    },
                    required: ["prompt"]
                }
            },
            {
                name: "search_messages",
                description: "Search the database of past messages for a specific keyword or topic.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "The keyword to search for (e.g. 'price', 'address', 'appointment')." },
                        limit: { type: "NUMBER", description: "Max number of results (default 5)." }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_daily_summary",
                description: "Generate a summary of conversations for a specific date. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: { type: "STRING", description: "Date to summarize (YYYY-MM-DD). Defaults to today." }
                    },
                    required: []
                }
            },
            {
                name: "search_all_conversations",
                description: "Search ALL conversations across all contacts. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Keyword to search for." },
                        limit: { type: "NUMBER", description: "Max results (default 10)." }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_recent_conversations",
                description: "Get list of recent conversations with all contacts. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        limit: { type: "NUMBER", description: "Number of conversations (default 10)." }
                    },
                    required: []
                }
            },
            {
                name: "get_system_status",
                description: "Check agent health, queue size, and database stats. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_analytics",
                description: "Get conversation analytics for the last 7 days. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_current_time",
                description: "Get the current date and time. CRITICAL: Use this FIRST when customers mention relative dates like 'tomorrow', 'next week', 'in 2 days', etc., so you can provide accurate scheduling information and know what specific dates they're referring to.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        timezone: { type: "STRING", description: "Optional timezone (e.g. 'America/New_York', 'Europe/London'). Defaults to system timezone." }
                    },
                    required: []
                }
            },
            {
                name: "check_availability",
                description: "Check the owner's calendar for available meeting slots on a specific date. IMPORTANT: If the customer uses relative terms like 'tomorrow', 'next week', etc., you MUST first call get_current_time to know today's date, then calculate the target date. The tool accepts 'today' or 'tomorrow' as shortcuts, OR a specific date in YYYY-MM-DD format.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: {
                            type: "STRING",
                            description: "Date to check. Can be: 'today', 'tomorrow', or YYYY-MM-DD format (e.g., '2026-01-29'). If customer says 'tomorrow', you can pass 'tomorrow' directly."
                        },
                        duration: {
                            type: "NUMBER",
                            description: "Meeting duration in minutes (default: 30). Common values: 10, 15, 30, 60"
                        }
                    },
                    required: ["date"]
                }
            },
            {
                name: "schedule_meeting",
                description: "Book a meeting slot on the owner's calendar and generate a Google Meet link. ONLY use this AFTER confirming availability with check_availability and getting customer confirmation.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: {
                            type: "STRING",
                            description: "Meeting date in YYYY-MM-DD format. Example: '2026-01-29'"
                        },
                        time: {
                            type: "STRING",
                            description: "Start time in HH:MM format (24-hour). Example: '14:30' for 2:30 PM"
                        },
                        duration: {
                            type: "NUMBER",
                            description: "Meeting duration in minutes. Example: 30"
                        },
                        customer_name: {
                            type: "STRING",
                            description: "Customer's full name"
                        },
                        customer_email: {
                            type: "STRING",
                            description: "Customer's email address (optional, but recommended for calendar invites)"
                        },
                        purpose: {
                            type: "STRING",
                            description: "Brief description of the meeting purpose. Example: 'Product demo' or 'Consultation call'"
                        }
                    },
                    required: ["date", "time", "duration", "customer_name", "purpose"]
                }
            },
            {
                name: "browse_url",
                description: "Fetch and extract content from a website URL. ONLY use this when the user explicitly requests information that requires browsing external websites (e.g., 'check the news', 'what is the price of X'). Do NOT use for general knowledge queries the AI can answer itself.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        url: {
                            type: "STRING",
                            description: "The full URL to fetch (e.g., 'https://example.com/article'). Must be a valid http or https URL."
                        },
                        extract_type: {
                            type: "STRING",
                            description: "What to extract: 'metadata' (title + description only), 'summary' (title + first paragraphs, default), or 'full' (entire page content)."
                        }
                    },
                    required: ["url"]
                }
            },
            {
                name: "search_web",
                description: "Search for information on any topic by intelligently determining the best source URL. Use this when the user asks for current information on news, sports, finance, weather, geopolitics, or any topic requiring real-time data. The AI will automatically find and browse the appropriate website.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: {
                            type: "STRING",
                            description: "The search query or topic (e.g., 'latest AI news', 'Bitcoin price', 'weather in Nairobi', 'Premier League scores')"
                        },
                        category: {
                            type: "STRING",
                            description: "Optional category hint: 'news', 'sports', 'finance', 'weather', 'tech', or 'general'. Helps determine the best source."
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "start_marketing_onboarding",
                description: "Start the setup interview for the AI Marketing Agent (AutoAdsPro). Use this when the user says 'setup marketing', 'start AutoAdsPro', or wants to configure their business profile.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                    required: []
                }
            },
            {
                name: "create_campaign",
                description: "Create a new weekly marketing campaign. Use this after onboarding is complete.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING", description: "Name of the campaign (default 'AutoAds Weekly')." }
                    },
                    required: []
                }
            },
            {
                name: "post_now",
                description: "Force the agent to generate and post a marketing message (Ad or Fact) immediately. Useful for testing or manual overrides.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        type: { type: "STRING", description: "Type of post: 'ad_morning', 'ad_afternoon', 'ad_evening', 'fact_morning', 'fact_afternoon', 'fact_evening'." },
                        custom_instructions: { type: "STRING", description: "Optional instructions for what the ad should say. E.g. 'Announce the agent is back online', 'Promote our new 50% discount'. If provided, this overrides the default random style." }
                    },
                    required: ["type"]
                }
            },
            {
                name: "send_random",
                description: "Send a random fun content (quote, joke, prediction, fact, riddle, or wisdom) to all groups immediately. Great for engagement!",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                    required: []
                }
            }
        ]
    }
];

// Helper to execute tools locally
export async function executeLocalTool(name: string, args: any, context: any) {
    console.log(`🛠️ Executing Tool: ${name}`, args);

    switch (name) {
        case 'update_contact_info':
            try {
                const { name, summary_addition, trust_level } = args;
                const phone = context?.contact?.phone;

                if (!phone) return { error: "No contact found in context." };

                const updateData: any = {};
                if (name) {
                    updateData.name = name;
                    updateData.confirmedName = name; // Also update confirmedName
                    updateData.isVerified = true; // Mark as verified!
                }
                if (trust_level !== undefined) updateData.trustLevel = trust_level;

                // Append to summary if provided
                if (summary_addition) {
                    const currentSummary = context?.contact?.summary || '';
                    updateData.summary = `${currentSummary}\n- ${summary_addition}`.trim();
                }

                if (Object.keys(updateData).length === 0) {
                    return { result: "No changes requested." };
                }

                await db.update(contacts)
                    .set(updateData)
                    .where(eq(contacts.phone, phone));

                console.log(`✅ Updated contact info for ${phone}:`, updateData);
                return { result: "Contact info updated successfully in database." };
            } catch (e: any) {
                console.error("Failed to update contact:", e);
                return { error: "Database update failed: " + e.message };
            }

        case 'check_schedule':
            return await googleCalendar.listEvents(args.day || 'today');

        case 'search_messages':
            try {
                const results = await db.select()
                    .from(messageLogs)
                    .where(ilike(messageLogs.content, `%${args.query}%`))
                    .orderBy(desc(messageLogs.createdAt))
                    .limit(args.limit || 5);

                if (results.length === 0) return { result: "No messages found matching that query." };

                return {
                    result: results.map(r => `[${r.createdAt?.toISOString()}] ${r.role}: ${r.content}`).join('\n')
                };
            } catch (e) {
                console.error(e);
                return { error: "Database search failed." };
            }

        // Owner-only tools
        case 'get_daily_summary':
            return { result: await ownerTools.getDailySummary(args.date) };

        case 'search_all_conversations':
            return { result: await ownerTools.searchConversations(args.query, args.limit || 10) };

        case 'get_recent_conversations':
            return { result: await ownerTools.getRecentConversations(args.limit || 10) };

        case 'generate_image':
            try {
                const { prompt } = args;
                console.log(`🎨 Generating image for prompt: "${prompt}"`);
                const imagePath = await googleImageGenerationService.generateImage(prompt);

                // Return a special object for the client to handle file upload
                return {
                    result: `[IMAGE_GENERATED]`,
                    _data: {
                        type: 'image_file', // Changed to image_file to denote local path
                        path: imagePath,
                        caption: prompt
                    }
                };
            } catch (e: any) {
                console.error('Image generation error:', e);
                return { error: `Failed to generate image: ${e.message}` };
            }

        case 'get_system_status':
            return { result: await ownerTools.getSystemStatus() };

        case 'get_analytics':
            return { result: await ownerTools.getAnalytics() };

        case 'check_availability':
            try {
                const { date, duration } = args;

                // Get timezone from context
                const userTimezone = context?.userProfile?.timezone || 'UTC';

                console.log(`📅 Checking availability for ${date} (${duration || 'default'} min) in ${userTimezone}`);
                const slots = await googleCalendar.findAvailableSlots(date, duration, userTimezone);

                if (slots.length === 0 || slots[0].includes('No')) {
                    return { result: slots[0] };
                }

                return {
                    result: `Available slots for ${date} (${userTimezone}):\n${slots.slice(0, 10).join(', ')}${slots.length > 10 ? ` (and ${slots.length - 10} more)` : ''}`
                };
            } catch (e: any) {
                console.error('Check availability error:', e);
                return { error: `Failed to check availability: ${e.message}` };
            }

        case 'schedule_meeting':
            try {
                const { date, time, duration, customer_name, customer_email, purpose } = args;

                // Get customer phone from context if available
                const customerPhone = context?.contact?.phone;

                // Get timezone from context
                const userTimezone = context?.userProfile?.timezone || 'UTC';

                console.log(`📅 Scheduling meeting for ${customer_name} on ${date} at ${time} (${userTimezone})`);

                const result = await googleCalendar.createMeeting({
                    date,
                    time,
                    duration,
                    customerName: customer_name,
                    customerEmail: customer_email,
                    purpose,
                    customerPhone
                }, userTimezone);

                if (result.success) {
                    return {
                        result: `✅ Meeting scheduled successfully!\n\nDate: ${date}\nTime: ${time}\nDuration: ${duration} minutes\nGoogle Meet Link: ${result.meetLink}\n\nEvent ID: ${result.eventId}`
                    };
                } else {
                    return { error: `Failed to schedule meeting: ${result.error}` };
                }
            } catch (e: any) {
                console.error('Schedule meeting error:', e);
                return { error: `Failed to schedule meeting: ${e.message}` };
            }

        case 'get_current_time':
            try {
                const now = new Date();

                // Priority: 1. Explicit timezone argument, 2. User's profile timezone, 3. System timezone
                const userTimezone = context?.userProfile?.timezone;
                const timezone = args.timezone || userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                console.log(`🕐 Getting time for timezone: ${timezone}${userTimezone ? ' (from user profile)' : ''}`);

                // Format the date and time
                const options: Intl.DateTimeFormatOptions = {
                    timeZone: timezone,
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short'
                };

                const formattedTime = now.toLocaleString('en-US', options);

                return {
                    result: `Current time: ${formattedTime}\nTimezone: ${timezone}\nISO: ${now.toISOString()}`
                };
            } catch (e) {
                console.error('Error getting current time:', e);
                return {
                    result: `Current time: ${new Date().toLocaleString()}\nTimezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
                };
            }

        case 'browse_url':
            try {
                const { url, extract_type = 'summary' } = args;
                console.log(`🌐 Browsing URL: ${url} (extract: ${extract_type})`);
                const content = await webScraper.scrapeUrl(url, extract_type);
                return { result: content };
            } catch (e: any) {
                console.error('Browse URL error:', e.message);
                return { error: `Failed to browse URL: ${e.message}` };
            }

        case 'search_web':
            try {
                const { query, category } = args;
                console.log(`🔍 Web search: "${query}"${category ? ` (category: ${category})` : ''}`);
                const content = await webScraper.searchWeb(query, category);
                return { result: content };
            } catch (e: any) {
                console.error('Search web error:', e.message);
                return { error: `Failed to search web: ${e.message}` };
            }

        // AGENT MARKETING TOOLS
        case 'start_marketing_onboarding':
            try {
                const { marketingService } = await import('../marketing/marketingService');
                const phone = context?.contact?.phone;
                if (!phone) return { error: "No contact phone found." };

                const response = await marketingService.startOnboarding(phone);
                return { result: response };
            } catch (e: any) {
                return { error: `Onboarding failed: ${e.message}` };
            }

        case 'create_campaign':
            try {
                const { marketingService } = await import('../marketing/marketingService');
                const response = await marketingService.createCampaign(args.name);
                return { result: response };
            } catch (e: any) {
                return { error: `Campaign creation failed: ${e.message}` };
            }

        case 'post_now':
            try {
                const { marketingService } = await import('../marketing/marketingService');
                // We need the client to post. In executeLocalTool we might not have it unless passed in context.
                // But executeLocalTool is usually called by Gemini, and we return text.
                // However, executeMarketingSlot posts independently.
                // We'll try to find a way to access the client, or just trigger the logic and return a status.
                // For now, we'll try to use the global client if available or just log it.

                // Hack: We can't easily get the client here if it's not in context.
                // But scheduler has it.
                // We'll rely on the fact that for 'post_now', we want to see the result in the chat flow.
                // Actually, executeMarketingSlot sends a NEW message. 
                // If we want to return it to the CURRENT conversation, we should just generate it and return it as the tool result.

                // Let's modify executeMarketingSlot logic to be reusable?
                // Or just generate the content here and return it.
                const { adContentService } = await import('../marketing/adContentService');
                const { factService } = await import('../marketing/factService');

                if (args.type.startsWith('ad') || args.type.startsWith('fact')) {
                    const client = context?.client;
                    if (!client) {
                        // Fallback: If no client in context (e.g. testing), just return the content
                        if (args.type.startsWith('fact')) {
                            const fact = await factService.getSmartFact('morning');
                            return { result: `(Simulation) 🎲 *Random Fact*\n\n${fact}` };
                        }
                        return { error: "WhatsApp Client not available in context. Cannot broadcast." };
                    }

                    const { marketingService } = await import('../marketing/marketingService');

                    // Trigger the ACTUAL broadcast logic
                    console.log(`🚀 Tool 'post_now' triggering broadcast for slot: ${args.type}`);
                    if (args.custom_instructions) {
                        console.log(`📝 Custom Instructions: "${args.custom_instructions}"`);
                    }

                    // Execute in background
                    marketingService.executeMarketingSlot(client, args.type, args.custom_instructions)
                        .catch(err => console.error(`❌ Background broadcast failed for ${args.type}:`, err));

                    return {
                        result: `✅ Broadcast command sent successfully for '${args.type}'.\nThe content is being generated${args.custom_instructions ? ' with your custom instructions' : ''} and sent to all target groups in the background.`
                    };
                } else {
                    return { error: "Invalid post type. Must start with 'ad' or 'fact'." };
                }
            } catch (e: any) {
                return { error: `Post now failed: ${e.message}` };
            }

        case 'send_random':
            try {
                const client = context?.client;
                if (!client) {
                    return { error: "WhatsApp Client not available in context. Cannot broadcast." };
                }

                const { randomContentService } = await import('../marketing/randomContentService');

                console.log('🎲 Tool send_random: Generating random content...');

                // Generate and broadcast in background
                (async () => {
                    try {
                        const randomContent = await randomContentService.generateRandomContent();
                        const message = randomContentService.formatForWhatsApp(randomContent);

                        const groups = await client.getAllGroups();

                        if (groups.length === 0) {
                            console.log('⚠️ No groups found for random content');
                            return;
                        }

                        console.log(`📢 Broadcasting random ${randomContent.type} to ${groups.length} groups...`);

                        for (const groupJid of groups) {
                            try {
                                await client.sendText(groupJid, message);
                                console.log(`✅ Random content sent to ${groupJid}`);

                                if (groups.indexOf(groupJid) < groups.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                }
                            } catch (error) {
                                console.error(`❌ Failed to send to ${groupJid}:`, error);
                            }
                        }

                        console.log('✅ Random content broadcast complete');
                    } catch (error) {
                        console.error('❌ Random content broadcast failed:', error);
                    }
                })();

                return {
                    result: `🎲 Random content is being generated and sent to all groups! It could be a quote, joke, prediction, fact, riddle, or wisdom. Stay tuned! ✨`
                };
            } catch (e: any) {
                return { error: `Send random failed: ${e.message}` };
            }

        default:
            return { error: "Tool not found." };
    }
}
