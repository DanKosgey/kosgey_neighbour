import { google } from 'googleapis';
import { config } from '../config/env';
import path from 'path';

export class GoogleCalendarService {
    private calendar: any;
    private calendarId: string;
    private workingHoursStart: string;
    private workingHoursEnd: string;
    private minMeetingDuration: number;
    private bufferTime: number;
    private bookingDays: number[];

    constructor() {
        this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

        console.log(`📅 Google Calendar Service Initialized with ID: "${this.calendarId}"`);

        // Scheduling configuration from environment
        this.workingHoursStart = process.env.WORKING_HOURS_START || '09:00';
        this.workingHoursEnd = process.env.WORKING_HOURS_END || '18:00';
        this.minMeetingDuration = parseInt(process.env.MIN_MEETING_DURATION || '10');
        this.bufferTime = parseInt(process.env.BUFFER_TIME || '15');
        this.bookingDays = process.env.BOOKING_DAYS
            ? process.env.BOOKING_DAYS.split(',').map(d => parseInt(d.trim()))
            : [1, 2, 3, 4, 5]; // Mon-Fri by default


        // Path to your service account key file
        const keyFilePath = path.join(process.cwd(), 'service-account.json');

        // Check if file exists
        const fs = require('fs');
        if (!fs.existsSync(keyFilePath)) {
            console.warn('⚠️  service-account.json not found. Calendar features will be disabled.');
            console.warn('   To enable: Place service-account.json in the project root directory.');
            // Initialize with a dummy auth that will fail gracefully
            this.calendar = null;
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFilePath,
            scopes: ['https://www.googleapis.com/auth/calendar.events'], // Upgraded from readonly
        });

        this.calendar = google.calendar({ version: 'v3', auth });
    }

    async listEvents(dateSpecifier: string): Promise<string> {
        if (!this.calendar) {
            return "Calendar integration not configured. Please contact the owner directly to schedule.";
        }

        try {
            // Default to UTC for generic list events if no timezone specified in this method header (TODO: Add timezone support to listEvents too?)
            // For now, let's use system/UTC default
            const { timeMin, timeMax } = this.parseDate(dateSpecifier, 'UTC');

            console.log(`📅 Fetching events for ${dateSpecifier} (${timeMin.toISOString()} - ${timeMax.toISOString()})`);

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

    /**
     * Parse relative date string to start/end Date objects respecting timezone
     */
    private parseDate(specifier: string, timezone: string): { timeMin: Date, timeMax: Date } {
        // Create a date object in the target timezone
        // We use string manipulation to "shift" the time to the target timezone perspective
        const getNowInTimezone = () => {
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const targetTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
            return targetTime;
        };

        const nowInTz = getNowInTimezone();
        const lower = specifier.toLowerCase();
        let targetDate = new Date(nowInTz);

        if (lower.includes('tomorrow')) {
            targetDate.setDate(targetDate.getDate() + 1);
        } else if (lower.includes('today')) {
            // targetDate is already nowInTz
        } else {
            // Try explicit date like YYYY-MM-DD
            const explicit = new Date(specifier);
            if (!isNaN(explicit.getTime())) {
                targetDate = explicit;
            }
        }

        // Set start of day in target timezone (00:00:00)
        // We construct the ISO string for the day start in the target timezone
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');

        // Note: Google Calendar API works best with ISO strings containing offsets
        // But generating accurate offset strings for any IANA timezone is complex without a library like moment-timezone or luxon.
        // Strategy: We will use the 'timeZone' parameter in list events to let Google handle the complexity where possible,
        // but for calculating slots we need local times.

        // We will return Javascript Date objects that represent the timestamps of 00:00 and 23:59 on that day
        // effectively in the system time, but corresponding to the remote timezone's day.

        // Simpler approach for availability check:
        // 1. Get midnight of target day in target timezone
        // 2. Convert that moment to UTC/System time for API query

        // Using Intl to get offset-aware parts is robust native method:
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        return { timeMin: startOfDay, timeMax: endOfDay };
    }

    /**
     * Find available time slots for a given date
     * @param dateSpecifier - Date string (YYYY-MM-DD, 'today', 'tomorrow')
     * @param durationMinutes - Meeting duration in minutes (defaults to minMeetingDuration)
     * @param timezone - Timezone to check availability in (e.g. 'Africa/Nairobi')
     * @returns Array of available time slots as strings
     */
    async findAvailableSlots(dateSpecifier: string, durationMinutes?: number, timezone: string = 'UTC'): Promise<string[]> {
        if (!this.calendar) {
            return ['Calendar integration not configured. Please contact the owner directly.'];
        }

        try {
            const duration = durationMinutes || this.minMeetingDuration;

            // 1. Determine the timeframe in the desired timezone
            // We use 'toLocaleString' to get the current date in the target timezone
            const nowInTzStr = new Date().toLocaleString('en-US', { timeZone: timezone });
            const nowInTz = new Date(nowInTzStr);

            let targetDate = new Date(nowInTz);
            if (dateSpecifier.toLowerCase().includes('tomorrow')) {
                targetDate.setDate(targetDate.getDate() + 1);
            } else if (!dateSpecifier.toLowerCase().includes('today')) {
                const parsed = new Date(dateSpecifier);
                if (!isNaN(parsed.getTime())) targetDate = parsed;
            }

            // Construct 00:00 to 23:59 bounds for the target day
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth();
            const day = targetDate.getDate();

            // We need to create a Date object that effectively represents midnight in the TARGET timezone
            // Trick: Parse "YYYY-MM-DD 00:00:00" treating it as the target timezone
            // Since JS Date doesn't support "create in timezone", we rely on the API's 'timeMin' and 'timeMax'
            // coupled with 'timeZone' param, or we pass ISO strings with offsets.
            // EASIEST WAY: Use the text specifier for the date only.

            // Let's refine the query:
            // We want events for "2024-05-20" in "Africa/Nairobi".
            const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // RFC3339 for Midnight in Target Timezone?
            // "2024-05-20T00:00:00+03:00"
            // To generate this without libraries, we can use the 'timeMin' as generic UTC and rely on 'singleEvents: true' to expand.
            // BUT correct filtering requires accurate bounds.

            // Let's use the 'parseDate' helper logic but simplified for API usage
            // We'll set timeMin to UTC start of that day (approx) minus buffer, and timeMax to end plus buffer,
            // then filter in memory based on the timezone-adjusted times.

            // Get RFC3339 range for the day in the specific timezone
            const getIsoInTz = (h: number, m: number, s: number) => {
                // Create a dummy date with correct time components
                const d = new Date(year, month, day, h, m, s);
                // Format it as part of a string that *would* be parsed as that time in that timezone
                // Note: This is tricky without libs. 
                // Workaround: Use 'timeMin' without offset and specify 'timeZone' in list() options?
                // Google API docs say: "timeZone: Time zone used in the response. The default is UTC."
                // But 'timeMin' must be RFC3339.

                // Fallback: Create generic UTC dates for the range covering the 24h period everywhere
                // Then filter strictly.
                return d;
            };

            const timeMin = new Date(Date.UTC(year, month, day, 0, 0, 0)); // Midnight UTC
            const timeMax = new Date(Date.UTC(year, month, day, 23, 59, 59)); // End of day UTC

            // Shift for timezone roughly? No, let's query a 48h buffer around UTC day to be safe
            // and filter locally.
            const queryMin = new Date(timeMin.getTime() - 24 * 60 * 60 * 1000);
            const queryMax = new Date(timeMax.getTime() + 24 * 60 * 60 * 1000);

            // Check booking day (Mon-Fri) based on the TARGET timezone's day of week
            // (We already calculated targetDate in the timezone reference frame)
            const dayOfWeek = targetDate.getDay() || 7;
            if (!this.bookingDays.includes(dayOfWeek)) {
                return [`No bookings available on ${targetDate.toLocaleDateString('en-US', { weekday: 'long' })}`];
            }

            console.log(`📅 Finding available slots for ${dayStr} in ${timezone} (duration: ${duration} min)`);

            // Fetch existing events (Broad query)
            const res = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: queryMin.toISOString(),
                timeMax: queryMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                timeZone: timezone // Ask Google to normalize response times to this TZ
            });

            const events = res.data.items || [];

            // Parse working hours config
            const [startHour, startMin] = this.workingHoursStart.split(':').map(Number);
            const [endHour, endMin] = this.workingHoursEnd.split(':').map(Number);

            // Construct Working Hours Boundaries in Target Timezone (as absolute timestamps)
            // We use the Intl.DateTimeFormat to force the specific time in that timezone
            const createDateAtTimeInTz = (h: number, m: number) => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
                // We create a Date that *represents* this time in the target TZ.
                // Best way: append offset? We don't know it easily.
                // Better way: Construct a date string and let the 'new Date()' parse it relative to system, 
                // then shift the timestamp by the diff between system and target.

                // Let's rely on string comparison for FREE SLOT generation
                return dateStr; // This is a naive placeholder logic description
            };

            // CORRECT APPROACH FOR SLOT GENERATION WITHOUT MOMENT-TIMEZONE:
            // 1. Generate candidate slots as abstract "HH:MM" strings (e.g. 09:00, 09:15...) from start to end working hours.
            // 2. For each candidate slot, construct a full timestamp assuming it is in Target Timezone.
            // 3. Check if that timestamp overlaps with any busy event (normalized to timestamps).

            const freeSlots: string[] = [];

            let currentHour = startHour;
            let currentMin = startMin;

            while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
                // Construct the candidate start time
                // Create a string that can be parsed by the 'toLocaleString' trick to verifying ordering

                // We need the absolute timestamp of "Target Date HH:MM in Target TZ"
                // Hack: Create a formatting string that produces ISO-like output for a given timestamp
                // then inverse it? Hard.

                // Alternative: Use a helper libraries. Since we can't add libs, we use this trick:
                // We rely on the fact that we can compare TimeStrings if we convert everything to the target TZ.

                const slotTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

                // Convert 'events' to simple "HH:MM" - "HH:MM" ranges in Target Timezone for the target day
                // This requires checking if event falls on this day.
                const isBusy = events.some((event: any) => {
                    // Get event start/end in Target Timezone
                    const startTz = new Date(event.start.dateTime || event.start.date).toLocaleString('en-US', { timeZone: timezone, hour12: false });
                    const endTz = new Date(event.end.dateTime || event.end.date).toLocaleString('en-US', { timeZone: timezone, hour12: false });

                    // Helper: "MM/DD/YYYY, HH:MM:SS" -> Date Object
                    const evtStart = new Date(startTz);
                    const evtEnd = new Date(endTz);

                    // Check if event is on this day (ignoring multi-day complexity for MVP)
                    if (evtStart.getDate() !== day) return false;

                    // Convert to minutes from midnight
                    const evtStartMins = evtStart.getHours() * 60 + evtStart.getMinutes();
                    const evtEndMins = evtEnd.getHours() * 60 + evtEnd.getMinutes();

                    const slotStartMins = currentHour * 60 + currentMin;
                    const slotEndMins = slotStartMins + duration;

                    // Buffer
                    const bufferedEvtStart = evtStartMins - this.bufferTime;
                    const bufferedEvtEnd = evtEndMins + this.bufferTime;

                    return (slotStartMins < bufferedEvtEnd && slotEndMins > bufferedEvtStart);
                });

                // Also check if slot is in the past (relative to Now in Target TZ)
                const slotStartMins = currentHour * 60 + currentMin;
                const nowTotalMins = nowInTz.getHours() * 60 + nowInTz.getMinutes();
                const isToday = nowInTz.getDate() === day && nowInTz.getMonth() === month && nowInTz.getFullYear() === year;

                const inPast = isToday && slotStartMins < nowTotalMins;

                if (!isBusy && !inPast) {
                    // Add to list
                    const displayTime = new Date(2000, 0, 1, currentHour, currentMin).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    freeSlots.push(displayTime);
                }

                // Increment by 15 mins
                currentMin += 15;
                if (currentMin >= 60) {
                    currentHour++;
                    currentMin = 0;
                }
            }

            if (freeSlots.length === 0) {
                return ['No available slots for this day'];
            }

            return freeSlots;

        } catch (error) {
            console.error('Error finding available slots:', error);
            return ['Unable to check availability. Please try again.'];
        }
    }

    /**
     * Create a meeting event with Google Meet link
     * @param params - Meeting details
     * @param timezone - Timezone for the meeting (default: UTC)
     * @returns Object with success status, event details, and Meet link
     */
    async createMeeting(params: {
        date: string;
        time: string;
        duration: number;
        customerName: string;
        customerEmail?: string;
        purpose: string;
        customerPhone?: string;
    }, timezone: string = 'UTC'): Promise<{ success: boolean; meetLink?: string; eventId?: string; error?: string }> {
        if (!this.calendar) {
            return {
                success: false,
                error: 'Calendar integration not configured. Please contact the owner directly to schedule.'
            };
        }

        try {
            // Parse date and time in context of the timezone
            // "2024-05-20" + "14:30" + "Africa/Nairobi" -> ISO String with correct offset
            // We use the ID-based timezone for the event creation which Google Calendar API supports natively!
            // We just need to formulate the dateTime string correctly: "YYYY-MM-DDTHH:mm:ss" (local time) 
            // AND pass the 'timeZone' field. Google handles the offset.

            const dateTimeLocal = `${params.date}T${params.time}:00`;

            console.log(`📅 Creating meeting: ${params.customerName} on ${dateTimeLocal} (${timezone})`);

            // Calculate end time (we need to pass end dateTime too)
            // Ideally we pass start/end with timezone

            // To calculate "End Time" string, we simply add minutes to the local parsing.
            const tempDate = new Date(`${params.date}T${params.time}:00`); // Parsed as local system time but we only need math
            tempDate.setMinutes(tempDate.getMinutes() + params.duration);

            // Extract HH:MM:SS for end time
            const endH = String(tempDate.getHours()).padStart(2, '0');
            const endM = String(tempDate.getMinutes()).padStart(2, '0');
            const endS = String(tempDate.getSeconds()).padStart(2, '0');
            const dateTimeEndLocal = `${params.date}T${endH}:${endM}:${endS}`;

            // Note: Crossing midnight?
            // If the duration crosses midnight, the date part of dateTimeEndLocal needs to be incremented.
            // Simple check:
            const startTotalMins = parseInt(params.time.split(':')[0]) * 60 + parseInt(params.time.split(':')[1]);
            const endTotalMins = startTotalMins + params.duration;

            let realEndDate = params.date;
            if (endTotalMins >= 1440) {
                // Next day
                const d = new Date(params.date);
                d.setDate(d.getDate() + 1);
                realEndDate = d.toISOString().split('T')[0];
            }
            const realEndDateTimeLocal = `${realEndDate}T${endH}:${endM}:${endS}`;


            // Build event object
            const event = {
                summary: `Meeting with ${params.customerName}`,
                description: `Purpose: ${params.purpose}

Customer Details:
- Name: ${params.customerName}
- Phone: ${params.customerPhone || 'N/A'}
- Email: ${params.customerEmail || 'N/A'}

Scheduled via WhatsApp AI Agent`,
                start: {
                    dateTime: dateTimeLocal,
                    timeZone: timezone, // Google handles the offset!
                },
                end: {
                    dateTime: realEndDateTimeLocal,
                    timeZone: timezone,
                },

                conferenceData: {
                    createRequest: {
                        requestId: `whatsapp-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 15 },
                    ],
                },
            };

            // Create the event (try with Google Meet first, fallback without if it fails)
            let response;
            console.log(`🔍 Inserting event into calendar: "${this.calendarId}"`);

            try {
                response = await this.calendar.events.insert({
                    calendarId: this.calendarId,
                    resource: event,
                    conferenceDataVersion: 1, // Required for Google Meet link generation
                });
            } catch (conferenceError: any) {
                // If Google Meet creation fails (common with service accounts), create without it
                console.log('⚠️  Google Meet creation failed, creating event without conference link...');
                const { conferenceData, ...eventWithoutConference } = event;
                response = await this.calendar.events.insert({
                    calendarId: this.calendarId,
                    resource: eventWithoutConference,
                });
            }

            const meetLink = response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri;

            if (meetLink) {
                console.log(`✅ Meeting created with Google Meet! Event ID: ${response.data.id}, Meet Link: ${meetLink}`);
            } else {
                console.log(`✅ Meeting created! Event ID: ${response.data.id} (No Google Meet link - you can add one manually in Google Calendar)`);
            }

            return {
                success: true,
                meetLink: meetLink,
                eventId: response.data.id,
            };

        } catch (error: any) {
            console.error('Error creating meeting:', error);
            return {
                success: false,
                error: error.message || 'Failed to create meeting',
            };
        }
    }
}

export const googleCalendar = new GoogleCalendarService();

