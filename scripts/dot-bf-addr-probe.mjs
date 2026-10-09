// Зонд кодовых точек адресов пары Book Fest (запуск 129). Читающий.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const ids = ['d3a4c641', '6c026f18'];
const rows = await selectAll(db, 'events', 'id,status,address,title');
for (const r of rows) {
  if (!ids.includes(String(r.id).slice(0, 8))) continue;
  console.log(String(r.id).slice(0, 8), r.status, '| address =', JSON.stringify(r.address));
  console.log('   codepoints >127:', [...(r.address || '')].map((c) => (c.codePointAt(0) > 127 ? `${c}(${c.codePointAt(0).toString(16)})` : c)).join(''));
}
