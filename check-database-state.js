import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkDatabaseState() {
  console.log('\n🔍 Checking Database State...\n');
  
  try {
    // Check admin_invites table
    console.log('📊 ADMIN_INVITES TABLE:');
    const { data: invites, error: inviteError } = await supabase
      .from('admin_invites')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (inviteError) {
      console.error('❌ Error querying admin_invites:', inviteError.message);
    } else if (!invites || invites.length === 0) {
      console.log('   ⚠️  No invites found');
    } else {
      invites.forEach((invite, i) => {
        console.log(`\n   ${i + 1}. Invite ID: ${invite.invite_id}`);
        console.log(`      Created by: ${invite.created_by}`);
        console.log(`      Active: ${invite.is_active}`);
        console.log(`      Expires: ${new Date(invite.expires_at).toLocaleString()}`);
        console.log(`      Max uses: ${invite.max_uses}`);
        console.log(`      Used count: ${invite.used_count}`);
        console.log(`      Created: ${new Date(invite.created_at).toLocaleString()}`);
      });
    }
    
    // Check admin_requests table
    console.log('\n\n📋 ADMIN_REQUESTS TABLE:');
    const { data: requests, error: requestError } = await supabase
      .from('admin_requests')
      .select('*')
      .order('requested_at', { ascending: false });
    
    if (requestError) {
      console.error('❌ Error querying admin_requests:', requestError.message);
    } else if (!requests || requests.length === 0) {
      console.log('   ⚠️  No requests found');
    } else {
      requests.forEach((request, i) => {
        console.log(`\n   ${i + 1}. Request ID: ${request.request_id}`);
        console.log(`      User ID: ${request.user_id}`);
        console.log(`      Invite ID: ${request.invite_id}`);
        console.log(`      Approved: ${request.is_approved}`);
        console.log(`      Approved by: ${request.approved_by || 'N/A'}`);
        console.log(`      Requested: ${new Date(request.requested_at).toLocaleString()}`);
      });
    }
    
    // Check parent table for pending admins
    console.log('\n\n👥 PARENT TABLE (Admin/Pending Users):');
    const { data: parents, error: parentError } = await supabase
      .from('user')
      .select('user_id, email, fname, lname, role, is_verified')
      .in('role', ['admin', 'pending']);
    
    if (parentError) {
      console.error('❌ Error querying parent:', parentError.message);
    } else if (!parents || parents.length === 0) {
      console.log('   ⚠️  No admin/pending users found');
    } else {
      parents.forEach((parent, i) => {
        console.log(`\n   ${i + 1}. ${parent.fname} ${parent.lname}`);
        console.log(`      Parent ID: ${parent.user_id}`);
        console.log(`      Email: ${parent.email}`);
        console.log(`      Role: ${parent.role}`);
        console.log(`      Verified: ${parent.is_verified}`);
      });
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

checkDatabaseState().then(() => process.exit(0));



