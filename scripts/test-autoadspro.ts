
import { marketingService } from '../src/services/marketing/marketingService';
import { schedulerService } from '../src/services/scheduler';

async function runTest() {
    console.log("🧪 Testing AutoAdsPro Features...");

    // Mock Client
    const mockClient = {
        sendText: async (jid: string, text: string) => console.log(`[MOCK SEND TEXT] To: ${jid}\nBody: ${text}\n`),
        sendImage: async (jid: string, buffer: any, caption: string) => {
            console.log(`[MOCK SEND IMAGE] To: ${jid}\nCaption: ${caption}\n[Image Buffer]`);
            require('fs').writeFileSync('debug_output.jpg', buffer);
            console.log("📸 Mock image saved to 'debug_output.jpg' for verification.");
        },
        getAllGroups: async () => {
            console.log("📢 [MOCK] Fetching groups...");
            return ['120363123456789@g.us', '120363987654321@g.us']; // Mock group JIDs
        }
    };

    try {
        // 1. Check Onboarding State (Mock data)
        console.log("\n--- 1. Testing Onboarding ---");
        const startMsg = await marketingService.startOnboarding("12345");
        console.log("Start Msg:", startMsg);

        const step2 = await marketingService.handleOnboardingResponse("12345", "Handmade Soap");
        console.log("Step 2 Reply:", step2);

        const step3 = await marketingService.handleOnboardingResponse("12345", "Eco-conscious moms");
        console.log("Step 3 Reply:", step3);

        const finish = await marketingService.handleOnboardingResponse("12345", "100% Organic Ingredients");
        console.log("Finish Reply:", finish);

        // 2. Create Campaign
        console.log("\n--- 2. Creating Campaign ---");
        const campRes = await marketingService.createCampaign("Test Campaign");
        console.log(campRes);

        // 3. Trigger Ad Slot (Text + Image)
        console.log("\n--- 3. Testing Ad Generation (Morning Ad) ---");
        // This might fail if no Google Keys, but logic should hold
        await marketingService.executeMarketingSlot(mockClient, 'ad_morning');

    } catch (e) {
        console.error("❌ Test Failed:", e);
    }
}

runTest();
