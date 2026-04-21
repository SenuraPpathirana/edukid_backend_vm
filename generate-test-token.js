import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function generateTestToken() {
  console.log('\n🔧 Generating test admin token...\n');
  
  try {
    // Generate token
    const token = crypto.randomBytes(8).toString('hex');
    console.log('🔑 Generated token:', token);
    console.log('📋 Copy this token to test the flow\n');
    
    // Hash it
    const tokenHash = await bcrypt.hash(token, 10);
    
    // Get an admin user to be the creator
    const { data: admins } = await supabase
      .from('user')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);
    
    if (!admins || admins.length === 0) {
      console.error('❌ No admin users found. Cannot create token.');
      return;
    }
    
    const createdBy = admins[0].user_id;
    
    // Insert into admin_invites
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
    
    const { data: invite, error } = await supabase
      .from('admin_invites')
      .insert({
        token_hash: tokenHash,
        created_by: createdBy,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        max_uses: 1,
        used_count: 0,
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error creating invite:', error);
      return;
    }
    
    console.log('✅ Token saved to database');
    console.log('📊 Invite ID:', invite.invite_id);
    console.log('📅 Expires:', expiresAt.toLocaleDateString());
    console.log('🔢 Max uses: 1');
    console.log('📈 Current uses: 0');
    
    console.log('\n📝 Test Steps:');
    console.log('1. Go to http://localhost:8081/admin-token');
    console.log('2. Enter token:', token);
    console.log('3. Click "Verify Token"');
    console.log('4. Complete signup or login');
    console.log('5. Check database for updates');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

generateTestToken().then(() => process.exit(0));



