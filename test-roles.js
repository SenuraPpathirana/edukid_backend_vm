import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkUsers() {
  console.log('\n🔍 Checking users in database...\n');
  console.log('ℹ️  Note: account_status removed from user table. Premium status now tracked per-kid in kid_profile.profile_status\n');
  
  const { data, error } = await supabase
    .from('user')
    .select('user_id, email, fname, lname, role, is_verified')
    .limit(10);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No users found in database');
    return;
  }

  console.log(`Found ${data.length} users:\n`);
  
  data.forEach((user, index) => {
    const roleValue = user.role || 'null';
    const roleEmoji = user.role === 'admin' ? '👑' : user.role === 'pending' ? '⏳' : '👤';
    const verifiedEmoji = user.is_verified ? '✅' : '❌';
    
    console.log(`${index + 1}. ${roleEmoji} ${user.fname} ${user.lname}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${roleValue} | Verified: ${verifiedEmoji}`);
    console.log('');
  });

  console.log('\n📋 Role Summary:');
  const admins = data.filter(u => u.role === 'admin').length;
  const pending = data.filter(u => u.role === 'pending').length;
  const users = data.filter(u => u.role === 'user').length;
  const nullRoles = data.filter(u => !u.role).length;
  
  console.log(`   👑 Admins: ${admins}`);
  console.log(`   ⏳ Pending: ${pending}`);
  console.log(`   👤 Users: ${users}`);
  console.log(`   ⚪ Null: ${nullRoles}`);
  console.log('');
}

checkUsers().then(() => process.exit(0));



