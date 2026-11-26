import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { data, error } = await db.from('events')
  .select('id,title,title_ru,city,address,lat,lng,start_date,start_time,end_date,status,website,description,source_type')
  .ilike('address', '*Frederick*').eq('status', 'active');
if (error) { console.log('ERR', error.message); process.exit(1); }
for (const r of data) console.log(JSON.stringify(r, null, 1));
