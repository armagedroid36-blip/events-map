// Точка «События»: карточка 29206756 «Once Show в VinWonders» стояла в Нячанге с адресом
// «VinWonders Nha Trang, Hon Tre Island», но страница источника (vinwonders.com/en/once-show/)
// — это шоу VinWonders Phú Quốc (Fire Phoenix Square, 18:45–19:05 ежедневно). Фукуок вне
// четырёх направлений сайта → карточка снимается с публикации (в archived, не удаляется).
// DRY по умолчанию, APPLY=1 — применить.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const ID = '29206756-1a5f-473f-82f2-b5cce7e48767';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,address,status,start_date,website');
const card = rows.find(r => r.id === ID);
console.log('до:', JSON.stringify({ id: card?.id, title: card?.title, city: card?.city, status: card?.status, address: card?.address }));

// страховка: рядом не должно быть живого близнеца по ключу title|start_date
const twins = rows.filter(r => r.id !== ID && r.title === card?.title && r.start_date === card?.start_date);
console.log('близнецов по ключу:', twins.length, twins.map(t => `${t.id} ${t.status}`).join('; '));

if (process.env.APPLY !== '1') { console.log('DRY: запусти с APPLY=1'); process.exit(0); }

const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', ID).select('id,title,city,status');
if (error) throw new Error(error.message);
console.log('обновлено:', JSON.stringify(data));

const after = await selectAll(db, 'events', 'id,status,city');
const a = after.find(r => r.id === ID);
console.log('после (чтение базы):', JSON.stringify({ id: a.id, city: a.city, status: a.status }));
const byStatus = {};
for (const r of after) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('events:', after.length, JSON.stringify(byStatus));
