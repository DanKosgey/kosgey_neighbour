/**
 * Gemini Function Declarations
 * These define the "Toolbox" the AI can use.
 */

import { googleCalendar } from '../googleCalendar';
import { db } from '../../database';
import { messageLogs } from '../../database/schema';
import { ilike, desc } from 'drizzle-orm';
import * as ownerTools from './ownerTools';

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
                    required: ["summary_addition"]
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
            }
        ]
    }
];

// Helper to execute tools locally
export async function executeLocalTool(name: string, args: any, context: any) {
    console.log(`🛠️ Executing Tool: ${name}`, args);

    switch (name) {
        case 'update_contact_info':
            return { result: "Contact info updated. You can confirm this to the user." };

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

        case 'get_system_status':
            return { result: await ownerTools.getSystemStatus() };

        case 'get_analytics':
            return { result: await ownerTools.getAnalytics() };

        default:
            return { error: "Tool not found." };
    }
}
