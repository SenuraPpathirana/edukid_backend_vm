import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:3000/api';

async function testTokenFlow() {
  console.log('\n🧪 Testing Admin Token Verification Flow\n');
  
  try {
    // Step 1: Generate a token (requires admin auth - skip for now)
    console.log('📝 Step 1: Get a generated token from ManageUsers UI');
    console.log('   (Skip - requires admin authentication)\n');
    
    // For testing, we need to get an actual token from the database
    // Let's verify the token from our previous generation
    const testToken = 'test-token-placeholder'; // Replace with actual generated token
    
    // Step 2: Verify the token (public endpoint - no auth required)
    console.log('🔍 Step 2: Verify admin token (public endpoint)');
    const verifyResponse = await fetch(`${API_URL}/admin/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: testToken }),
    });
    
    const verifyResult = await verifyResponse.json();
    console.log('   Status:', verifyResponse.status);
    console.log('   Response:', JSON.stringify(verifyResult, null, 2));
    
    if (verifyResult.valid) {
      console.log('   ✅ Token is valid!');
    } else {
      console.log('   ❌ Token is invalid or expired');
    }
    
    console.log('\n📋 Complete Flow:');
    console.log('   1. Admin generates token via ManageUsers UI');
    console.log('   2. Token is shown in popup (copy once)');
    console.log('   3. User goes to /admin-token page');
    console.log('   4. User enters token → calls POST /admin/verify-token (public)');
    console.log('   5. If valid → navigate to /admin-signup');
    console.log('   6. User registers with role="pending"');
    console.log('   7. User verifies email');
    console.log('   8. User logs in → calls POST /admin/create-request (authenticated)');
    console.log('   9. Admin request created, awaiting approval');
    console.log('   10. Existing admin approves request');
    console.log('   11. User role changed from "pending" to "admin"');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testTokenFlow();
