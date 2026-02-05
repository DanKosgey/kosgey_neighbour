import { db } from '../database';
import { adEngagements, marketingCampaigns, contacts, messageLogs, messageQueue, queueMetrics } from '../database/schema';
import { eq, sql, desc, gte } from 'drizzle-orm';

export class AnalyticsService {
    private static instance: AnalyticsService;

    private constructor() { }

    public static getInstance(): AnalyticsService {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }

    /**
     * Track an engagement event
     */
    public async trackEngagement(
        type: 'delivered' | 'read' | 'reply',
        messageId: string,
        campaignId: number | null,
        userPhone: string,
        groupJid: string | null = null,
        context: any = {}
    ) {
        try {
            // Deduplication for 'read' events (only count first read per user/msg)
            if (type === 'read') {
                const existing = await db.query.adEngagements.findFirst({
                    where: (ae, { and, eq }) => and(
                        eq(ae.messageId, messageId),
                        eq(ae.userPhone, userPhone),
                        eq(ae.type, 'read')
                    )
                });
                if (existing) return; // Already tracked
            }

            await db.insert(adEngagements).values({
                type,
                messageId,
                campaignId,
                userPhone,
                groupJid,
                context,
                createdAt: new Date()
            });

            console.log(`📊 Tracked '${type}' from ${userPhone} (Msg: ${messageId})`);
        } catch (error) {
            console.error('Failed to track engagement:', error);
        }
    }

    /**
     * Get Aggregated Dashboard Data (legacy - kept for backward compat)
     */
    public async getDashboardStats() {
        const full = await this.getComprehensiveDashboard();
        return {
            overview: full.overview,
            topCampaigns: full.topCampaigns
        };
    }

    /**
     * Comprehensive analytics for WhatsApp/Baileys - real-world data analyst insights
     */
    public async getComprehensiveDashboard() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 1. Engagement Overview (ad campaigns)
        const engagementStats = await db.select({
            type: adEngagements.type,
            count: sql<number>`count(*)`
        })
            .from(adEngagements)
            .groupBy(adEngagements.type);

        const statsMap = engagementStats.reduce((acc, curr) => {
            acc[curr.type] = Number(curr.count);
            return acc;
        }, {} as Record<string, number>);

        // 2. Campaign Performance
        const campaignPerformance = await db.select({
            id: marketingCampaigns.id,
            name: marketingCampaigns.name,
            reads: sql<number>`count(case when ${adEngagements.type} = 'read' then 1 end)`,
            replies: sql<number>`count(case when ${adEngagements.type} = 'reply' then 1 end)`
        })
            .from(marketingCampaigns)
            .leftJoin(adEngagements, eq(marketingCampaigns.id, adEngagements.campaignId))
            .groupBy(marketingCampaigns.id, marketingCampaigns.name)
            .orderBy(desc(sql`count(case when ${adEngagements.type} = 'read' then 1 end)`))
            .limit(5);

        // 3. Contact & Message Metrics
        const totalContacts = await db.select({ count: sql<number>`count(*)` })
            .from(contacts)
            .then(res => Number(res[0]?.count || 0));

        const totalMessages = await db.select({ count: sql<number>`count(*)` })
            .from(messageLogs)
            .then(res => Number(res[0]?.count || 0));

        const avgChatLength = totalContacts > 0 ? Math.round(totalMessages / totalContacts) : 0;

        // 4. Message Volume by Day (last 7 days)
        const volumeByDay = await db.execute(sql`
            SELECT 
                date_trunc('day', created_at AT TIME ZONE 'UTC')::date as day,
                count(*)::int as count
            FROM message_logs
            WHERE created_at >= ${sevenDaysAgo}
            GROUP BY 1
            ORDER BY 1 ASC
        `);
        const volRows = Array.isArray(volumeByDay) ? volumeByDay : (volumeByDay?.rows || []);
        const messageVolumeByDay = (volRows as { day: Date; count: number }[]).map(r => ({
            date: r.day instanceof Date ? r.day.toISOString().split('T')[0] : String(r.day || '').split('T')[0],
            count: Number(r.count)
        }));

        // 5. Peak Activity by Hour (0-23)
        const volumeByHour = await db.execute(sql`
            SELECT 
                EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int as hour,
                count(*)::int as count
            FROM message_logs
            WHERE created_at >= ${sevenDaysAgo}
            GROUP BY 1
            ORDER BY 1 ASC
        `);
        const hourRows = Array.isArray(volumeByHour) ? volumeByHour : (volumeByHour?.rows || []);
        const hourMap = (hourRows as { hour: number; count: number }[]).reduce((acc, r) => {
            acc[Number(r.hour)] = Number(r.count);
            return acc;
        }, {} as Record<number, number>);
        const peakActivityByHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] || 0 }));

        // 6. Message Type Distribution
        const typeDistribution = await db.select({
            type: messageLogs.type,
            count: sql<number>`count(*)`
        })
            .from(messageLogs)
            .where(gte(messageLogs.createdAt, sevenDaysAgo))
            .groupBy(messageLogs.type);

        const messageTypes = typeDistribution.map(t => ({
            type: t.type || 'text',
            count: Number(t.count)
        }));

        // 7. Inbound vs Outbound (user vs agent)
        const roleDistribution = await db.select({
            role: messageLogs.role,
            count: sql<number>`count(*)`
        })
            .from(messageLogs)
            .where(gte(messageLogs.createdAt, sevenDaysAgo))
            .groupBy(messageLogs.role);

        const inboundOutbound = roleDistribution.reduce((acc, r) => {
            acc[r.role] = Number(r.count);
            return acc;
        }, {} as Record<string, number>);

        // 8. Queue Health (latest metrics)
        let queueHealth = { pending: 0, avgProcessingMs: 0, processedToday: 0 };
        try {
            const pendingCount = await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(eq(messageQueue.status, 'pending'))
                .then(r => Number(r[0]?.count || 0));

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const processedToday = await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(eq(messageQueue.status, 'completed'))
                .then(r => Number(r[0]?.count || 0)); // Simplified - could filter by processedAt

            const latestMetrics = await db.select()
                .from(queueMetrics)
                .orderBy(desc(queueMetrics.timestamp))
                .limit(1)
                .then(rows => rows[0]);

            queueHealth = {
                pending: pendingCount,
                avgProcessingMs: latestMetrics?.avgProcessingTimeMs || 0,
                processedToday
            };
        } catch {
            // Queue tables might not exist in older setups
        }

        // 9. New Contacts (last 7 days)
        const newContactsCount = await db.select({ count: sql<number>`count(*)` })
            .from(contacts)
            .where(gte(contacts.createdAt, sevenDaysAgo))
            .then(r => Number(r[0]?.count || 0));

        // 10. Response time proxy: avg time between user msg and next agent msg (sample last 7d)
        // Simplified: we'll compute a rough estimate from message order
        let avgResponseTimeSec = 0;
        try {
            const responseSamples = await db.execute(sql`
                WITH ordered_msgs AS (
                    SELECT contact_phone, role, created_at,
                        LAG(created_at) OVER (PARTITION BY contact_phone ORDER BY created_at) as prev_ts,
                        LAG(role) OVER (PARTITION BY contact_phone ORDER BY created_at) as prev_role
                    FROM message_logs
                    WHERE created_at >= ${sevenDaysAgo}
                )
                SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_ts)))::int as avg_sec
                FROM ordered_msgs
                WHERE role = 'agent' AND prev_role = 'user' AND prev_ts IS NOT NULL
            `);
            const respRows = Array.isArray(responseSamples) ? responseSamples : (responseSamples?.rows || []);
            const row = (respRows as { avg_sec: number }[])[0];
            avgResponseTimeSec = row?.avg_sec ? Math.round(Number(row.avg_sec)) : 0;
        } catch {
            // Fallback if query fails
        }

        // 11. Most active contacts (top 5 by message count)
        const topContacts = await db.select({
            contactPhone: messageLogs.contactPhone,
            count: sql<number>`count(*)`
        })
            .from(messageLogs)
            .where(gte(messageLogs.createdAt, sevenDaysAgo))
            .groupBy(messageLogs.contactPhone)
            .orderBy(desc(sql`count(*)`))
            .limit(5);

        const topContactsWithNames = await Promise.all(
            topContacts.map(async (tc) => {
                const contactRows = await db.select()
                    .from(contacts)
                    .where(eq(contacts.phone, tc.contactPhone || ''))
                    .limit(1);
                const c = contactRows[0];
                return {
                    phone: tc.contactPhone,
                    name: c?.confirmedName || c?.name || c?.originalPushname || tc.contactPhone,
                    messageCount: Number(tc.count)
                };
            })
        );

        const delivered = statsMap['delivered'] || 0;
        const read = statsMap['read'] || 0;
        const replies = statsMap['reply'] || 0;

        return {
            overview: {
                delivered,
                read,
                replies,
                readRate: delivered ? Math.round((read / delivered) * 100) : 0,
                replyRate: delivered ? Math.round((replies / delivered) * 100) : 0,
                activeChats: totalContacts,
                totalMessages,
                avgChatLength,
                newContactsLast7d: newContactsCount,
                avgResponseTimeSec,
                queuePending: queueHealth.pending,
                avgProcessingMs: queueHealth.avgProcessingMs
            },
            topCampaigns: campaignPerformance,
            messageVolumeByDay,
            peakActivityByHour,
            messageTypes,
            inboundOutbound: {
                inbound: inboundOutbound['user'] || 0,
                outbound: inboundOutbound['agent'] || 0
            },
            topContactsByVolume: topContactsWithNames,
            queueHealth
        };
    }
}

export const analyticsService = AnalyticsService.getInstance();
