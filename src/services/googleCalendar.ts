import { google } from 'googleapis';
import { config } from '../config/env';
import path from 'path';

export class GoogleCalendarService {
    private calendar: any;
    private calendarId: string;

    constructor() {
        this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

        // Path to your service account key file
        const keyFilePath = path.join(process.cwd(), 'service-account.json');

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFilePath,
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        });

        this.calendar = google.calendar({ version: 'v3', auth });
    }

    async listEvents(dateSpecifier: string): Promise<string> {
        try {
            const { timeMin, timeMax } = this.parseDate(dateSpecifier);

            console.log(`📅 Fetching events for ${dateSpecifier} (${timeMin} - ${timeMax})`);

            const res = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = res.data.items;
            if (!events || events.length === 0) {
                return `No events found for ${dateSpecifier}.`;
            }

            return events.map((event: any) => {
                const start = event.start.dateTime || event.start.date;
                const end = event.end.dateTime || event.end.date;
                // Simple formatting
                const timeStr = event.start.dateTime
                    ? `${new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'All Day';

                return `- [${timeStr}] ${event.summary}`;
            }).join('\n');

        } catch (error) {
            console.error('Calendar Error:', error);
            // Fallback for demo if users haven't set up keys yet
            return "Unable to access calendar (Check credentials). Assuming Free.";
        }
    }

    private parseDate(specifier: string): { timeMin: Date, timeMax: Date } {
        const now = new Date();
        const lower = specifier.toLowerCase();

        let targetDate = new Date();

        if (lower.includes('tomorrow')) {
            targetDate.setDate(now.getDate() + 1);
        } else if (lower.includes('today')) {
            // targetDate is already now
        } else {
            // Try parse logic or AI might pass specific date
            // For MVP, default to today/tomorrow logic or basic check
        }

        const timeMin = new Date(targetDate.setHours(0, 0, 0, 0));
        const timeMax = new Date(targetDate.setHours(23, 59, 59, 999));

        return { timeMin, timeMax };
    }
}

export const googleCalendar = new GoogleCalendarService();
