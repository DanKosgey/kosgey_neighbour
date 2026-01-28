
import cron, { ScheduledTask } from 'node-cron';
import { WhatsAppClient } from '../core/whatsapp';
import { ownerService } from './ownerService';
import { getDailySummary } from './ai/ownerTools';

export class SchedulerService {
    private client: WhatsAppClient | undefined;
    private tasks: ScheduledTask[] = [];

    init(client: WhatsAppClient) {
        this.client = client;
        this.start();
    }

    start() {
        // Stop existing tasks to prevent duplicates
        this.stop();

        console.log('⏰ Starting Scheduler Service...');

        // 1. Morning Motivation (7:00 AM)
        // Cron format: Minute Hour Day Month DayOfWeek
        const morningTask = cron.schedule('0 7 * * *', async () => {
            console.log('🌅 Running morning motivation task...');
            await this.sendMorningMotivation();
        });
        this.tasks.push(morningTask);

        // 2. Evening Summary (9:00 PM)
        const eveningTask = cron.schedule('0 21 * * *', async () => {
            console.log('🌙 Running evening summary task...');
            await this.sendEveningSummary();
        });
        this.tasks.push(eveningTask);

        console.log(`✅ Scheduler initialized with ${this.tasks.length} jobs: Morning (7am), Evening (9pm)`);
    }

    stop() {
        if (this.tasks.length > 0) {
            console.log(`🛑 Stopping ${this.tasks.length} active scheduler tasks...`);
            this.tasks.forEach(task => task.stop());
            this.tasks = [];
        }
    }

    private async sendMorningMotivation() {
        if (!this.client) return;

        const ownerJid = ownerService.getOwnerJid();
        if (!ownerJid) {
            console.log('⚠️ No owner check found, skipping morning motivation.');
            return;
        }

        try {
            const quotes = [
                "Discipline is doing what needs to be done, even if you don't want to do it.",
                "Your future is created by what you do today, not tomorrow.",
                "Success is the sum of small efforts, repeated day in and day out.",
                "Focus on the goal, not the obstacle.",
                "The only way to do great work is to love what you do.",
                "Don't watch the clock; do what it does. Keep going.",
                "Believe you can and you're halfway there."
            ];
            const quote = quotes[Math.floor(Math.random() * quotes.length)];

            await this.client.sendText(ownerJid, `🌅 *Morning Motivation*\n\n"${quote}"\n\nHave a productive day!`);
            console.log('✅ Sent morning motivation to owner.');
        } catch (error) {
            console.error('Error sending motivation:', error);
        }
    }

    private async sendEveningSummary() {
        if (!this.client) return;

        const ownerJid = ownerService.getOwnerJid();
        if (!ownerJid) {
            console.log('⚠️ No owner check found, skipping evening summary.');
            return;
        }

        try {
            console.log('📊 Generating evening summary...');
            // Calculate yesterday's date if needed, or getDailySummary defaults to today
            const summary = await getDailySummary();

            await this.client.sendText(ownerJid, summary);
            console.log('✅ Sent evening summary to owner.');
        } catch (error) {
            console.error('Error sending evening summary:', error);
        }
    }
}

export const schedulerService = new SchedulerService();
