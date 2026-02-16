/**
 * Scheduler Service
 * Triggers marketing slots at specific times of day
 */

import { WhatsAppClient } from '../core/whatsapp';
import { marketingService } from './marketing/marketingService';

export class SchedulerService {
    private static instance: SchedulerService;
    private checkInterval: NodeJS.Timeout | null = null;
    private isRunning = false;
    private lastExecutedSlots: Set<string> = new Set();

    // Schedule: [hour, minute, slotType]
    private schedule: Array<{ hour: number; minute: number; slot: string }> = [
        { hour: 7, minute: 0, slot: 'ad_morning' },
        { hour: 13, minute: 0, slot: 'ad_afternoon' },
        { hour: 19, minute: 0, slot: 'ad_evening' }
    ];

    private constructor() { }

    public static getInstance(): SchedulerService {
        if (!SchedulerService.instance) {
            SchedulerService.instance = new SchedulerService();
        }
        return SchedulerService.instance;
    }

    /**
     * Start the scheduler (checks every minute)
     */
    public start(whatsappClient: WhatsAppClient): void {
        if (this.isRunning) {
            console.log('⚠️ SchedulerService already running');
            return;
        }

        this.isRunning = true;
        console.log('📅 Starting SchedulerService...');
        console.log('   Schedule:');
        this.schedule.forEach(s => {
            console.log(`   - ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} → ${s.slot}`);
        });

        // Check every minute
        this.checkInterval = setInterval(() => {
            this.checkAndExecute(whatsappClient);
        }, 60000); // 60 seconds

        // Also check immediately on start
        this.checkAndExecute(whatsappClient);
    }

    /**
     * Stop the scheduler
     */
    public stop(): void {
        if (!this.isRunning) return;

        console.log('🛑 Stopping SchedulerService...');
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log('✅ SchedulerService stopped');
    }

    /**
     * Check current time and execute matching slots
     */
    private async checkAndExecute(whatsappClient: WhatsAppClient): Promise<void> {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDay = now.toDateString(); // To prevent duplicate execution on same day

        for (const item of this.schedule) {
            if (item.hour === currentHour && item.minute === currentMinute) {
                const slotKey = `${currentDay}-${item.slot}`;

                // Prevent duplicate execution within the same minute
                if (this.lastExecutedSlots.has(slotKey)) {
                    continue;
                }

                console.log(`⏰ Triggering scheduled slot: ${item.slot} at ${currentHour}:${String(currentMinute).padStart(2, '0')}`);

                try {
                    await marketingService.executeMarketingSlot(
                        whatsappClient,
                        item.slot as any
                    );
                    this.lastExecutedSlots.add(slotKey);
                } catch (error) {
                    console.error(`❌ Failed to execute slot ${item.slot}:`, error);
                }
            }
        }

        // Cleanup old entries (keep only today's)
        const todayPrefix = currentDay + '-';
        this.lastExecutedSlots = new Set(
            Array.from(this.lastExecutedSlots).filter(key => key.startsWith(todayPrefix))
        );
    }
}

export const schedulerService = SchedulerService.getInstance();
