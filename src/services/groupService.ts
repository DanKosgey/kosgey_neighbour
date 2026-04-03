import { db } from '../database';
import { groups, groupMembers, adEngagements } from '../database/schema';
import { eq, sql } from 'drizzle-orm';

export class GroupService {
    private static instance: GroupService;

    // Deduplication: track which JIDs are actively being synced
    private syncingJids: Set<string> = new Set();
    // Throttle: don't allow more than N concurrent syncs
    private activeSyncCount: number = 0;
    private readonly MAX_CONCURRENT_SYNCS = 3;

    private constructor() { }

    public static getInstance(): GroupService {
        if (!GroupService.instance) {
            GroupService.instance = new GroupService();
        }
        return GroupService.instance;
    }

    /**
     * Syncs a single group's metadata and participants to the DB.
     *
     * Improvements over original:
     * 1. Deduplication guard — if the same JID is already syncing, skip.
     * 2. Concurrency throttle — cap simultaneous syncs at MAX_CONCURRENT_SYNCS.
     * 3. Batch upsert for members — raw SQL INSERT ... ON CONFLICT DO UPDATE
     *    replaces N individual findFirst+insert/update round-trips per member.
     */
    public async syncGroup(jid: string, metadata: any) {
        if (!metadata) return;

        // --- Guard 1: skip if this exact group is already mid-sync ---
        if (this.syncingJids.has(jid)) {
            return; // silently skip; do not log noise
        }

        // --- Guard 2: throttle if too many concurrent syncs ---
        if (this.activeSyncCount >= this.MAX_CONCURRENT_SYNCS) {
            // Too busy — drop this event; next groups.update will re-trigger
            return;
        }

        this.syncingJids.add(jid);
        this.activeSyncCount++;

        try {
            console.log(`🔄 Syncing Group: ${metadata.subject} (${jid})`);

            // 1. Upsert the group row
            const admins = metadata.participants.filter(
                (p: any) => p.admin === 'admin' || p.admin === 'superadmin'
            );

            await db.insert(groups).values({
                jid,
                subject: metadata.subject,
                description: metadata.desc,
                creationTime: new Date(metadata.creation * 1000),
                ownerJid: metadata.owner,
                totalMembers: metadata.participants.length,
                adminsCount: admins.length,
                isAnnounce: metadata.announce || false,
                isRestricted: metadata.restrict || false,
                updatedAt: new Date()
            }).onConflictDoUpdate({
                target: groups.jid,
                set: {
                    subject: metadata.subject,
                    description: metadata.desc,
                    totalMembers: metadata.participants.length,
                    adminsCount: admins.length,
                    isAnnounce: metadata.announce || false,
                    isRestricted: metadata.restrict || false,
                    updatedAt: new Date()
                }
            });

            // 2. Batch upsert members using raw SQL ON CONFLICT
            //    group_members has an index on (group_jid, phone) but no UNIQUE constraint,
            //    so we use a DELETE + INSERT approach per chunk to stay safe.
            const allParticipants = metadata.participants.map((p: any) => {
                const phone = p.id.replace(/:[0-9]+@/, '@');
                return {
                    groupJid: jid,
                    phone,
                    role: (p.admin as string) || 'participant',
                    isAdmin: !!p.admin,
                };
            });

            // Delete existing members for this group in one shot, then bulk-insert fresh
            // This is much faster than N individual findFirst+update+insert queries
            // and avoids the need for a UNIQUE constraint.
            await db.delete(groupMembers).where(eq(groupMembers.groupJid, jid));

            const chunkSize = 100;
            for (let i = 0; i < allParticipants.length; i += chunkSize) {
                const chunk = allParticipants.slice(i, i + chunkSize);
                await db.insert(groupMembers).values(
                    chunk.map((m: any) => ({
                        groupJid: m.groupJid,
                        phone: m.phone,
                        role: m.role,
                        isAdmin: m.isAdmin,
                        joinedAt: new Date(),
                        updatedAt: new Date()
                    }))
                );
            }

            console.log(`✅ Synced ${allParticipants.length} members for ${metadata.subject}`);
        } catch (error) {
            console.error(`❌ Group sync failed for ${jid}:`, error);
        } finally {
            this.syncingJids.delete(jid);
            this.activeSyncCount--;
        }
    }

    /**
     * Get statistics for the dashboard
     */
    public async getGroupStats() {
        console.log('🔍 GroupService: Retrieving stats...');
        // Total Groups
        const totalGroups = await db.select({ count: sql<number>`count(*)` })
            .from(groups)
            .then(res => res[0]?.count || 0);

        console.log(`📊 Found ${totalGroups} total groups in DB`);

        // Top 5 Largest Groups
        const largestGroups = await db.select()
            .from(groups)
            .orderBy(sql`${groups.totalMembers} DESC`)
            .limit(5);

        console.log(`🏆 Retrieved ${largestGroups.length} largest groups`);

        // Admin Density (Average admins per group)
        const avgAdmins = await db.select({
            avg: sql<number>`avg(${groups.adminsCount})`
        }).from(groups).then(res => Math.round(Number(res[0]?.avg || 0) * 10) / 10);

        return {
            totalGroups,
            largestGroups,
            avgAdmins
        };
    }

    /**
     * Get detailed analytics for a specific group
     */
    public async getGroupDetails(jid: string) {
        // 1. Group Metadata
        const groupInfo = await db.query.groups.findFirst({
            where: eq(groups.jid, jid)
        });

        if (!groupInfo) return null;

        // 2. Members List (First 50 for now)
        const members = await db.query.groupMembers.findMany({
            where: eq(groupMembers.groupJid, jid),
            limit: 50,
            orderBy: (gm, { desc }) => [desc(gm.isAdmin), desc(gm.updatedAt)]
        });

        // 3. Engagement Stats for this group
        const engagementStats = await db.select({
            type: adEngagements.type,
            count: sql<number>`count(*)`
        })
            .from(adEngagements)
            .where(eq(adEngagements.groupJid, jid))
            .groupBy(adEngagements.type);

        const statsMap = engagementStats.reduce((acc, curr) => {
            acc[curr.type] = Number(curr.count);
            return acc;
        }, {} as Record<string, number>);

        return {
            info: groupInfo,
            members,
            stats: {
                delivered: statsMap['delivered'] || 0,
                read: statsMap['read'] || 0,
                replies: statsMap['reply'] || 0,
                readRate: statsMap['delivered'] ? Math.round((statsMap['read'] || 0) / statsMap['delivered'] * 100) : 0
            }
        };
    }
}

export const groupService = GroupService.getInstance();
