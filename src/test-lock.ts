import { sessionManager } from './services/sessionManager';

async function testLockRefresh() {
    console.log('🧪 Testing Lock Refresh...');
    console.log('1️⃣ Acquiring Lock...');
    const locked = await sessionManager.acquireLock();

    if (!locked) {
        console.error('❌ Failed to acquire lock (check if dev server is running)');
        process.exit(1);
    }

    console.log('✅ Lock acquired. Waiting for refresh cycle...');
    console.log('   (You should see "Session lock refreshed" logs in the actual app if it was running this script)');

    // Release immediately for test
    await sessionManager.releaseLock();
    console.log('✅ Lock released');

    process.exit(0);
}

testLockRefresh().catch(console.error);
