import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function setupTestRoles() {
  console.log('\n🔧 Setting up test roles...\n');
  
  // Get all users
  const { data: users, error } = await supabase
    .from('user')
    .select('user_id, email, fname, lname');

  if (error) {
    console.error('❌ Error fetching users:', error.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log('⚠️  No users found');
    return;
  }

  // Update first user to admin
  if (users[0]) {
    const { error: adminError } = await supabase
      .from('user')
      .update({ role: 'admin', is_verified: true })
      .eq('user_id', users[0].user_id);

    if (!adminError) {
      console.log(`✅ Set ${users[0].email} as ADMIN (verified)`);
    }
  }

  // Update second user to pending
  if (users[1]) {
    const { error: pendingError } = await supabase
      .from('user')
      .update({ role: 'pending', is_verified: true })
      .eq('user_id', users[1].user_id);

    if (!pendingError) {
      console.log(`✅ Set ${users[1].email} as PENDING (verified)`);
    }
  }

  // Update third user to regular user
  if (users[2]) {
    const { error: userError } = await supabase
      .from('user')
      .update({ role: 'user', is_verified: true })
      .eq('user_id', users[2].user_id);

    if (!userError) {
      console.log(`✅ Set ${users[2].email} as USER (verified)`);
    }
  }

  console.log('\n📝 Test credentials (all passwords should be what you set during registration):');
  console.log('\n👑 ADMIN LOGIN:');
  console.log(`   Email: ${users[0]?.email}`);
  console.log('   Expected behavior: Redirect to /admin/dashboard');
  
  console.log('\n⏳ PENDING LOGIN:');
  console.log(`   Email: ${users[1]?.email}`);
  console.log('   Expected behavior: Show approval pending dialog with contact admin option');
  
  console.log('\n👤 USER LOGIN:');
  console.log(`   Email: ${users[2]?.email}`);
  console.log('   Expected behavior: Redirect to /kids');
  
  console.log('\n✨ All users verified and ready for testing!\n');
}

setupTestRoles().then(() => process.exit(0));



