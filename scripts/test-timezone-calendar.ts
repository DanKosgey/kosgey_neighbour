
import dotenv from 'dotenv';
dotenv.config();

import { googleCalendar } from '../src/services/googleCalendar';

async function testTimezoneLogic() {
    console.log('🧪 Testing Timezone-Aware Calendar Logic\n');

    // MOCK: We are not mocking the calendar service itself, but we will call it with different timezones
    // and observe the logs (which we can't easily capture here, but we can verify it doesn't crash).

    // Test 1: Check availability for "tomorrow" in Tokyo (JST)
    console.log('🇯🇵 Test 1: Checking availability for "tomorrow" in Asia/Tokyo...');
    console.log('(Expected: Should look for slots in JST timeframe)');
    try {
        const slotsJST = await googleCalendar.findAvailableSlots('tomorrow', 30, 'Asia/Tokyo');
        console.log(`✅ JST Result: Found ${slotsJST.length} slots/messages.`);
        if (slotsJST.length > 0) console.log(`Sample: ${slotsJST[0]}`);
    } catch (e) {
        console.error('❌ JST Test failed:', e);
    }
    console.log('\n');

    // Test 2: Check availability for "tomorrow" in New York (EST)
    console.log('🇺🇸 Test 2: Checking availability for "tomorrow" in America/New_York...');
    console.log('(Expected: Should look for slots in EST timeframe, which is 13-14 hours behind Tokyo)');
    try {
        const slotsNY = await googleCalendar.findAvailableSlots('tomorrow', 30, 'America/New_York');
        console.log(`✅ NY Result: Found ${slotsNY.length} slots/messages.`);
        if (slotsNY.length > 0) console.log(`Sample: ${slotsNY[0]}`);
    } catch (e) {
        console.error('❌ NY Test failed:', e);
    }
    console.log('\n');

    console.log('🎉 Test completed. Please manually check server logs for correct date/time parsing.');
}

testTimezoneLogic();
