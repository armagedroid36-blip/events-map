// Пин карточек Лимасол-округа на центровом фолбэке, у которых адрес/заголовок называет ДЕРЕВНЮ
// (фестиваль в деревне, а пин стоит в центре Лимасола за 15-35 км). Точка деревни — Nominatim/OSM.
// DRY по умолчанию; APPLY=1 — запись. Адрес и city НЕ трогаем (address входит в ключ дедупа).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const FALL = [34.7071, 33.0226]; // центровой фолбэк Лимасола
const TOL = 0.0012;              // ~130 м

const TARGETS = [
  { id: 'd87d66e1', frag: 'Kyperounta Apple Festival', lat: 34.9411917, lng: 32.9742528, src: 'адрес «Kyperounta’s Square, 1st April 18, Kyperounta»' },
  { id: '162f7ff0', frag: 'Apple Festival', lat: 34.9411917, lng: 32.9742528, src: 'заголовок «Apple Festival 2026 @ Kyperounta Central Square»' },
  { id: '1aa0ea86', frag: 'Zivania Festival', lat: 34.8955424, lng: 32.9667058, src: 'заголовок «Zivania Festival 2026 @ Pelendri Village»' },
  { id: 'aad7defc', frag: 'Mushroom Festival', lat: 34.6807311, lng: 32.9206439, src: 'заголовок «Mushroom Festival 2026 @ Erimi Village Square»' },
  { id: '3da16852', frag: 'Kazaniasmata', lat: 34.8405459, lng: 32.7688904, src: 'заголовок «Kazaniasmata Festival 2026 @ Arsos»' },
  { id: 'f47b1210', frag: 'Palouzes Festival', lat: 34.8606896, lng: 32.8743527, src: 'заголовок «Palouzes Festival 2026 @ Pera Pedi»' },
  { id: '1ad13fd9', frag: 'Presentation of the Virgin Mary', lat: 34.9176417, lng: 33.0184087, src: 'адрес «Agros Village»' },
  { id: '3d41949b', frag: 'Ancient Olive Trees Festival', lat: 34.6780746, lng: 32.7926051, src: 'адрес «Paramali Community Park, Paramali»' },
  { id: '909dd160', frag: 'Authentic Traditional Flavours', lat: 34.9622213, lng: 33.0108464, src: 'адрес «Agios Georgios Church Square, Lagoudera»' },
  { id: 'c907317b', frag: 'Fun Day at Zoopigi', lat: 34.8628981, lng: 33.0151709, src: 'адрес «Municipal Park Zoopigi, Koumantareas 5, Zoopigi»' },
  { id: 'f11532ee', frag: 'COMMANDARIA', lat: 34.8495055, lng: 33.0238099, src: 'адрес «Central Square of the Community, 68 Commandarias Avenue, Kalo Chorio»' },
];

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date');
const byId = new Map(rows.map((r) => [String(r.id).slice(0, 8), r]));

const near = (a, b) => a != null && Math.abs(Number(a) - b) <= TOL;
const km = (a, b, c, d) => Math.round(Math.hypot((a - c) * 111, (b - d) * 92) * 100) / 100;

let applied = 0, skipped = 0, errors = 0;
for (const t of TARGETS) {
  const r = byId.get(t.id);
  if (!r) { console.log(`ПРОПУСК ${t.id}: нет в базе`); skipped++; continue; }
  const s = (r.status === 'active' || r.status === 'moderation') ? 'живая' : `НЕ живая (${r.status})`;
  const title = `${r.title || ''} ${r.title_ru || ''}`;
  if (s !== 'живая') { console.log(`ПРОПУСК ${t.id}: ${s}`); skipped++; continue; }
  if (!String(r.city || '').startsWith('Лимасол')) { console.log(`ПРОПУСК ${t.id}: city «${r.city}» не Лимасол`); skipped++; continue; }
  if (!near(r.lat, FALL[0]) || !near(r.lng, FALL[1])) { console.log(`ПРОПУСК ${t.id}: не на центровом фолбэке (${r.lat},${r.lng})`); skipped++; continue; }
  if (!title.toLowerCase().includes(t.frag.toLowerCase())) { console.log(`ПРОПУСК ${t.id}: заголовок «${String(r.title).slice(0, 40)}» не содержит «${t.frag}»`); skipped++; continue; }
  const dist = km(Number(r.lat), Number(r.lng), t.lat, t.lng);
  if (dist < 3) { console.log(`ПРОПУСК ${t.id}: сдвиг всего ${dist} км`); skipped++; continue; }
  console.log(`${APPLY ? 'ЗАПИСЬ' : 'КАНДИДАТ'} ${t.id} | ${r.start_date} | сдвиг ${dist} км | ${t.src}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ lat: t.lat, lng: t.lng }).eq('id', r.id).select('id');
  if (error || !data?.length) { console.log(`   ОШИБКА: ${error?.message || 'нет строк'}`); errors++; continue; }
  applied++;
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}, ошибок ${errors}`);
