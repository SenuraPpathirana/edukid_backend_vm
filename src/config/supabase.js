import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

let supabase = null;

if (!SUPABASE_URL) {
  // Helpful warning for developers instead of letting the library throw
  // when an empty URL is passed.
  // Set SUPABASE_URL and SUPABASE_KEY in backend/.env or your environment.
  // Example: SUPABASE_URL=https://xyz.supabase.co
  console.warn('[supabase] SUPABASE_URL is not set. Supabase client will not be initialized.');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: false,
    },
    global: {
      headers: { 'x-my-custom-header': 'no-cache' },
    },
  });
}

export { supabase };


