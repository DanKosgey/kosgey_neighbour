/**
 * Owner Tools
 * AI tools available only to the owner for managing the agent
 */

import { db } from '../../database';
import { contacts, messageLogs } from '../../database/schema';
import { desc, sql, eq, and, gte } from 'drizzle-orm';
import { rateLimitManager } from '../rateLimitManager';
import { systemSettingsService } from '../systemSettings';

/**
 * Generate daily summary of conversations
 */
export async function getDailySummary(date?: string): Promise<string> {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    // Get all conversations from today
    const todayMessages = await db.select()
        .from(messageLogs)
        .where(and(
            gte(messageLogs.createdAt, startOfDay),
            sql`${messageLogs.createdAt} <= ${endOfDay}`
        ))
        .orderBy(desc(messageLogs.createdAt));

    if (todayMessages.length === 0) {
        return "No conversations today yet.";
    }

    // Group by contact
    const conversationMap = new Map<string, any[]>();
    for (const msg of todayMessages) {
        const phone = msg.contactPhone || 'unknown';
        if (!conversationMap.has(phone)) {
            conversationMap.set(phone, []);
        }
        conversationMap.get(phone)!.push(msg);
    }

    // Get contact details
    const contactPhones = Array.from(conversationMap.keys());
    const contactDetails = await db.select()
        .from(contacts)
        .where(sql`${contacts.phone} IN (${sql.join(contactPhones.map(p => sql`${p}`), sql`, `)})`);

    // Build summary
    let summary = `📊 Daily Summary - ${targetDate.toLocaleDateString()}\n\n`;
    summary += `💬 Conversations: ${conversationMap.size}\n`;
    summary += `📨 Total Messages: ${todayMessages.length}\n\n`;
    summary += `🗣️ Active Contacts:\n`;

    for (const contact of contactDetails) {
        const msgs = conversationMap.get(contact.phone) || [];
        const lastMsg = msgs[0];
        summary += `• ${contact.name || 'Unknown'} (${msgs.length} msgs)\n`;
        summary += `  Last: "${(lastMsg?.content || '').substring(0, 50)}..."\n`;
    }

    return summary;
}

/**
 * Search conversations by keyword
 */
export async function searchConversations(query: string, limit: number = 10): Promise<string> {
    const results = await db.select()
        .from(messageLogs)
        .where(sql`LOWER(${messageLogs.content}) LIKE LOWER(${'%' + query + '%'})`)
        .orderBy(desc(messageLogs.createdAt))
        .limit(limit);

    if (results.length === 0) {
        return `No messages found matching "${query}".`;
    }

    // Get contact names
    const contactPhones = [...new Set(results.map(r => r.contactPhone))];
    const contactDetails = await db.select()
        .from(contacts)
        .where(sql`${contacts.phone} IN (${sql.join(contactPhones.map(p => sql`${p}`), sql`, `)})`);

    const contactMap = new Map(contactDetails.map(c => [c.phone, c.name || 'Unknown']));

    let output = `🔍 Search Results for "${query}":\n\n`;
    for (const msg of results) {
        const contactName = contactMap.get(msg.contactPhone || 'unknown') || 'Unknown';
        const date = msg.createdAt?.toLocaleDateString() || 'Unknown date';
        output += `📅 ${date} - ${contactName}\n`;
        output += `${msg.role === 'user' ? '👤' : '🤖'}: ${msg.content}\n\n`;
    }

    return output;
}

/**
 * Get recent conversations
 */
export async function getRecentConversations(limit: number = 10): Promise<string> {
    // Get latest message from each contact
    // Note: We order by the subquery directly to avoid alias scope issues in some SQL dialects/drivers
    const recentContacts = await db.select({
        phone: contacts.phone,
        name: contacts.name,
        lastMessage: sql<string>`(
            SELECT content FROM ${messageLogs} 
            WHERE ${messageLogs.contactPhone} = ${contacts.phone}
            ORDER BY ${messageLogs.createdAt} DESC 
            LIMIT 1
        )`,
        lastMessageTime: sql<Date>`(
            SELECT ${messageLogs.createdAt} FROM ${messageLogs}
            WHERE ${messageLogs.contactPhone} = ${contacts.phone}
            ORDER BY ${messageLogs.createdAt} DESC
            LIMIT 1
        )`
    })
        .from(contacts)
        .orderBy(desc(sql`(
            SELECT ${messageLogs.createdAt} FROM ${messageLogs}
            WHERE ${messageLogs.contactPhone} = ${contacts.phone}
            ORDER BY ${messageLogs.createdAt} DESC
            LIMIT 1
        )`))
        .limit(limit);

    if (recentContacts.length === 0) {
        return "No recent conversations.";
    }

    let output = `💬 Recent Conversations:\n\n`;
    let found = false;

    for (const contact of recentContacts) {
        if (!contact.lastMessageTime) continue;

        found = true;
        const timeAgo = getTimeAgo(contact.lastMessageTime);
        output += `• ${contact.name || 'Unknown'} (${timeAgo})\n`;
        output += `  "${(contact.lastMessage || '').substring(0, 60)}..."\n\n`;
    }

    if (!found) {
        return "No recent conversations found.";
    }

    return output;
}

/**
 * Get system status
 */
export async function getSystemStatus(): Promise<string> {
    const queueSize = rateLimitManager.size();
    const isLimited = rateLimitManager.isLimited();

    const totalContacts = await db.select({ count: sql<number>`count(*)` })
        .from(contacts)
        .then(r => r[0].count);

    const totalMessages = await db.select({ count: sql<number>`count(*)` })
        .from(messageLogs)
        .then(r => r[0].count);

    let status = `🔧 System Status\n\n`;
    status += `📊 Database:\n`;
    status += `• Contacts: ${totalContacts}\n`;
    status += `• Messages: ${totalMessages}\n\n`;
    status += `⚡ Queue:\n`;
    status += `• Pending: ${queueSize} messages\n`;
    status += `• Rate Limited: ${isLimited ? '⚠️ Yes' : '✅ No'}\n\n`;
    status += `🤖 Agent: ✅ Online\n`;

    return status;
}

/**
 * Get conversation analytics
 */
export async function getAnalytics(): Promise<string> {
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const recentMessages = await db.select()
        .from(messageLogs)
        .where(gte(messageLogs.createdAt, last7Days));

    const totalConversations = new Set(recentMessages.map(m => m.contactPhone)).size;

    let analytics = `📊 Analytics (Last 7 Days)\n\n`;
    analytics += `💬 Conversations: ${totalConversations}\n`;
    analytics += `📨 Messages: ${recentMessages.length}\n`;
    analytics += `📈 Avg per day: ${Math.round(recentMessages.length / 7)}\n`;

    return analytics;
}

// Helper function
function getTimeAgo(date: Date | null): string {
    if (!date) return 'Unknown';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
/**
 * Enable calendar access for the agent
 */
export async function enableCalendarAccess(): Promise<string> {
    try {
        await systemSettingsService.enableCalendarAccess();
        return `✅ Calendar access has been ENABLED.\n\nThe agent can now:\n- Check your calendar availability\n- View your schedule\n- Book meetings\n\nCalendarScheduling tools are now available in the agent's toolset.`;
    } catch (error: any) {
        console.error('Failed to enable calendar access:', error);
        return `❌ Error enabling calendar access: ${error.message}`;
    }
}

/**
 * Disable calendar access for the agent
 */
export async function disableCalendarAccess(): Promise<string> {
    try {
        await systemSettingsService.disableCalendarAccess();
        return `🔒 Calendar access has been DISABLED.\n\nThe agent can NO LONGER:\n- Check your calendar availability\n- View your schedule\n- Book meetings\n\nCalendar scheduling tools have been revoked from the agent's toolset. When customers ask to schedule meetings, the agent will inform them that calendar access is currently unavailable.`;
    } catch (error: any) {
        console.error('Failed to disable calendar access:', error);
        return `❌ Error disabling calendar access: ${error.message}`;
    }
}

/**
 * Get current calendar access status
 */
export async function getCalendarAccessStatus(): Promise<string> {
    try {
        const isEnabled = await systemSettingsService.isCalendarAccessEnabled();
        const status = isEnabled ? '✅ ENABLED' : '🔒 DISABLED';
        return `📅 Calendar Access Status: ${status}\n\nThe database currently has calendar access set to: ${isEnabled ? 'enabled' : 'disabled'}.\n\nUse "enable calendar" or "disable calendar" to change this setting.`;
    } catch (error: any) {
        console.error('Failed to get calendar access status:', error);
        return `❌ Error retrieving calendar access status: ${error.message}`;
    }
}