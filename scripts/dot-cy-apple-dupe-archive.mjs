// dot-cy-apple-dupe-archive.mjs — разовый ремонт класса «одно событие тремя источниками»:
// Kyperounta Apple Festival 10–11.10.2026 собран из visitcyprus, cyprusnow и limassoltourism
// тремя активными карточками на ОДНОЙ точке (после запуска 111 все три стоят на 34.9411917,32.9742528)
// → три метки на карте на одном месте. Ключ дедупа `title|start_date` их не склеивает (названия разные).
// Оставляем самую полную карточку (адрес площади, цена, две даты), остальные — в архив.
// Архив — не удаление (штатный dedupe-events.mjs делает то же).
// DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const KEEP = 'd87d66e1'; // visitcyprus: адрес «Kyperounta’s Square, 1st April 18», цена 0 EUR, 10–11.10 10:00–20:00
const TARGETS = {
  '162f7ff0': { title: 'Apple Festival 2026 @ Kyperounta Central Square', start_date: '2026-10-10', city: 'Лимасол, Кипр' },
  'fc8854a4': { title: '22nd Apple Festival: Traditional Harvest Celebration in Limassol', start_date: '2026-10-10', city: 'Лимасол, Кипр' },
};

const rows = await selectAll(db, 'events', 'id,title,start_date,end_date,city,address,lat,lng,website,status,photos,created_at');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));

const keep = byId.get(KEEP);
console.log(`${KEEP} | ${keep?.status} | ${keep?.title} | ${keep?.start_date}..${keep?.end_date} | ${keep?.lat},${keep?.lng} | ${keep?.address}`);
if (!keep || keep.status !== 'active') { console.log('СТОП: оставляемая карточка не active'); process.exit(1); }

let applied = 0, skipped = 0;
for (const [prefix, t] of Object.entries(TARGETS)) {
  const r = byId.get(prefix);
  if (!r) { console.log(`ПРОПУСК ${prefix}: нет в базе`); skipped++; continue; }
  console.log(`${prefix} | ${r.status} | ${r.title} | ${r.start_date} | ${r.city} | ${r.lat},${r.lng}`);
  if (r.status !== 'active') { console.log(`   -> пропуск: статус ${r.status}`); skipped++; continue; }
  if (r.title !== t.title || r.start_date !== t.start_date || r.city !== t.city) { console.log('   -> пропуск: данные не совпадают'); skipped++; continue; }
  if (!/apple\s* festival/i.test(r.title) || !/apple\s* festival/i.test(keep.title)) { console.log('   -> пропуск: заголовки не про фестиваль яблок'); skipped++; continue; }
  // точка либо совпадает с оставляемой карточкой, либо это центровой фолбэк Лимасола
  // (34.7071,33.0226 — 30 км от Киперунды, отдельный класс «пин на фолбэке, событие в деревне»)
  const near = (a, b, c, d) => Math.abs(Number(a) - b) < 0.001 && Math.abs(Number(c) - d) < 0.001;
  const samePoint = near(r.lat, keep.lat, r.lng, keep.lng) || near(r.lat, 34.7071, r.lng, 33.0226);
  if (!samePoint) { console.log(`   -> пропуск: точка не совпадает ни с оставляемой, ни с фолбэком Лимасола (${r.lat},${r.lng})`); skipped++; continue; }
  console.log(`   одно событие двумя источниками: оставляю ${KEEP} (${keep.title}), архивирую ${prefix} (${r.website})`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', r.id).select('id,status');
  if (error || !data?.length || data[0].status !== 'archived') { console.log(`   ОШИБКА записи: ${error?.message || JSON.stringify(data)}`); skipped++; continue; }
  applied++;
  console.log(`   записано: ${data[0].status}`);
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
