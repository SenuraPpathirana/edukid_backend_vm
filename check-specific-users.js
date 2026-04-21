import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkSpecificUsers() {
  console.log('\n🔍 Checking specific test users...\n');
  
  const emails = ['senu@test.com', 'senu1@test.com', 'senu2@test.com'];
  
  for (const email of emails) {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.log(`❌ ${email}: ${error.message}`);
      continue;
    }

    if (data) {
      console.log(`✅ ${email}:`);
      console.log(`   Name: ${data.fname} ${data.lname}`);
      console.log(`   Role: ${JSON.stringify(data.role)}`);
      console.log(`   Verified: ${data.is_verified}`);
      console.log('');
    }
  }
}

checkSpecificUsers().then(() => process.exit(0));



