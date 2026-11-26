import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const id = 'b7f2db34-1689-482d-b52e-dd28cc933fec';
const { data, error } = await db.from('events').update({ status: 'moderation', auto_review: { engine: 'dot-manual', verdict: 'review', reason: 'день тура Ларнака 16.11.2026 был ошибочно снят как день внутри интервала карточки Лимасола; интервал сведён, страница bz /ru/event/3a86 называет три города' } }).eq('id', id).eq('status', 'archived').select('id,title,start_date,start_time,city,address,status');
console.log(error || data);
