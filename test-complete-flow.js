import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:3000/api';

// Test credentials
const PENDING_USER = {
  email: 'senu1@test.com',
  password: 'Test123!', // You may need to update this
};

const TEST_TOKEN = '6108a741cf8852aa';

async function testCompleteFlow() {
  console.log('\n🧪 Testing Complete Admin Token Flow\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Verify the token exists in database
    console.log('\n📋 Step 1: Checking if token exists in database...');
    const checkDbResponse = await fetch(`${API_URL}/admin/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TEST_TOKEN }),
    });
    
    const checkDbResult = await checkDbResponse.json();
    console.log('   Status:', checkDbResponse.status);
    console.log('   Valid:', checkDbResult.valid);
    
    if (!checkDbResult.valid) {
      console.log('\n❌ Token is not valid! Generate a new one with:');
      console.log('   node generate-test-token.js');
      return;
    }
    
    console.log('   ✅ Token is valid in database');
    
    // Step 2: Login as pending user
    console.log('\n🔐 Step 2: Logging in as pending user...');
    console.log('   Email:', PENDING_USER.email);
    
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PENDING_USER),
    });
    
    const loginResult = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.log('   ❌ Login failed:', loginResult.error || loginResult.message);
      console.log('   Please verify credentials or update password in script');
      return;
    }
    
    console.log('   ✅ Login successful');
    console.log('   User role:', loginResult.user.role);
    console.log('   Access token:', loginResult.accessToken.substring(0, 20) + '...');
    
    if (loginResult.user.role !== 'pending') {
      console.log('\n   ⚠️  User role is not "pending"!');
      console.log('   Current role:', loginResult.user.role);
      console.log('   This test requires a user with role="pending"');
      return;
    }
    
    // Step 3: Create admin request with token
    console.log('\n📝 Step 3: Creating admin request with token...');
    
    const createRequestResponse = await fetch(`${API_URL}/admin/create-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginResult.accessToken}`,
      },
      body: JSON.stringify({ token: TEST_TOKEN }),
    });
    
    const createRequestResult = await createRequestResponse.json();
    console.log('   Status:', createRequestResponse.status);
    
    if (!createRequestResponse.ok) {
      console.log('   ❌ Failed:', createRequestResult.message);
      console.log('   Full response:', JSON.stringify(createRequestResult, null, 2));
      return;
    }
    
    console.log('   ✅ Admin request created!');
    console.log('   Request ID:', createRequestResult.request?.request_id);
    console.log('   User ID:', createRequestResult.request?.user_id);
    console.log('   Invite ID:', createRequestResult.request?.invite_id);
    
    // Step 4: Verify database was updated
    console.log('\n🔍 Step 4: Verifying database updates...');
    console.log('   Run this command to check:');
    console.log('   node check-database-state.js');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FLOW COMPLETED SUCCESSFULLY!');
    console.log('=' .repeat(60));
    console.log('\nExpected database changes:');
    console.log('1. admin_invites: used_count incremented (0 → 1)');
    console.log('2. admin_requests: new record created');
    console.log('3. parent: role remains "pending" (awaiting approval)');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
  }
}

console.log('⚙️  Configuration:');
console.log('   API URL:', API_URL);
console.log('   Test User:', PENDING_USER.email);
console.log('   Test Token:', TEST_TOKEN);
console.log('');

testCompleteFlow().then(() => {
  console.log('\n✅ Test execution completed');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
