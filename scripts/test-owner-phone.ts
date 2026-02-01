/**
 * Test Owner Identification by Phone Number Only
 * This test verifies that the owner can be identified using just their phone number
 * without relying on the LID (Linked ID)
 */

import dotenv from 'dotenv';
dotenv.config();

import { ownerService } from '../src/services/ownerService';

async function testOwnerIdentification() {
    console.log('🧪 Testing Owner Identification (Phone Number Only)\n');

    try {
        // Get owner phone from .env
        const ownerPhone = process.env.OWNER_PHONE_NUMBER;

        if (!ownerPhone) {
            console.error('❌ OWNER_PHONE_NUMBER not set in .env file');
            console.log('\n📝 Please add OWNER_PHONE_NUMBER to your .env file');
            console.log('Example: OWNER_PHONE_NUMBER=+254745026933');
            process.exit(1);
        }

        console.log(`📱 Owner Phone from .env: ${ownerPhone}`);

        // Normalize the phone number (remove + and spaces)
        const normalizedPhone = ownerPhone.replace(/[^0-9]/g, '');
        console.log(`🔢 Normalized Phone: ${normalizedPhone}`);

        // Test 1: Standard WhatsApp JID format (phone@s.whatsapp.net)
        console.log('\n📋 Test 1: Standard WhatsApp JID Format');
        const standardJid = `${normalizedPhone}@s.whatsapp.net`;
        console.log(`   Testing JID: ${standardJid}`);
        const isOwner1 = ownerService.isOwner(standardJid);
        console.log(`   Result: ${isOwner1 ? '✅ OWNER IDENTIFIED' : '❌ NOT RECOGNIZED AS OWNER'}`);

        // Test 2: With + prefix
        console.log('\n📋 Test 2: Phone with + Prefix');
        const jidWithPlus = `+${normalizedPhone}@s.whatsapp.net`;
        console.log(`   Testing JID: ${jidWithPlus}`);
        const isOwner2 = ownerService.isOwner(jidWithPlus);
        console.log(`   Result: ${isOwner2 ? '✅ OWNER IDENTIFIED' : '❌ NOT RECOGNIZED AS OWNER'}`);

        // Test 3: Different number (should NOT be owner)
        console.log('\n📋 Test 3: Different Phone Number (Negative Test)');
        const differentJid = '254700000000@s.whatsapp.net';
        console.log(`   Testing JID: ${differentJid}`);
        const isOwner3 = ownerService.isOwner(differentJid);
        console.log(`   Result: ${isOwner3 ? '❌ INCORRECTLY IDENTIFIED AS OWNER' : '✅ CORRECTLY NOT OWNER'}`);

        // Test 4: Test database-based owner phone (if configured)
        console.log('\n📋 Test 4: Database-Based Owner Phone');
        const dbPhone = await ownerService.getOwnerPhoneFromDB();
        console.log(`   Owner phone from DB/Config: ${dbPhone}`);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));

        const allPassed = isOwner1 && isOwner2 && !isOwner3;

        if (allPassed) {
            console.log('✅ ALL TESTS PASSED!');
            console.log('\n🎉 Owner identification is working correctly using phone number only.');
            console.log('   The system does NOT require LID for owner identification.');
            console.log('\n📝 Next Steps:');
            console.log('   1. Send a message from your WhatsApp number');
            console.log('   2. Check that you get owner-specific features (faster response, etc.)');
            console.log('   3. Verify in logs that you\'re identified as owner');
        } else {
            console.log('❌ SOME TESTS FAILED!');
            console.log('\n🔍 Issues found:');
            if (!isOwner1) console.log('   - Standard JID format not recognized');
            if (!isOwner2) console.log('   - JID with + prefix not recognized');
            if (isOwner3) console.log('   - Different number incorrectly identified as owner');
        }

        console.log('\n💡 Tips:');
        console.log('   - Make sure OWNER_PHONE_NUMBER in .env matches your WhatsApp number');
        console.log('   - You can also update it via the User Profile page in the dashboard');
        console.log('   - Format: +254XXXXXXXXX (with country code)');

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        console.error('\n🔍 Error details:', error);
        process.exit(1);
    }
}

// Run tests
testOwnerIdentification();
