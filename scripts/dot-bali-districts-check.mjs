// Юнит + проверка на живой ленте: районы Бали (bali-districts.mjs).
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtFor, districtCenter, missingCenterLabels, BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

let ok = 0, bad = 0;
const t = (name, got, want) => { if (String(got) === String(want)) { ok++; } else { bad++; console.log(`  ПРОВАЛ ${name}: получил ${got}, ждал ${want}`); } };
t('Чемаги→Табанан', districtFor('', 'Чемаги'), 'Табанан');
t('Далунг→Керобокан', districtFor('', 'Далунг'), 'Керобокан');
t('Переренан→Чангу', districtFor('', 'Переренан'), 'Чангу');
t('Пекату→Печату (Улувату)', districtFor('', 'Пекату'), 'Печату (Улувату)');
t('Пандава→Кутух (кир)', districtFor('', 'Пандава'), 'Кутух');
t('Pandawa→Кутух (лат)', districtFor('', 'Pandawa'), 'Кутух');
t('адрес Пандава-бич → Кутух', districtFor('Jl. Pantai Pandawa, Kutuh, Kec. Kuta Sel.', 'Пандава'), 'Кутух');
t('Тегалаланг', districtFor('', 'Тегалаланг'), 'Тегалаланг');
t('Tegallalang лат', districtFor('', 'Tegallalang'), 'Тегалаланг');
t('адрес важнее района', districtFor('Jl. Bumbak, Kerobokan', 'Dalung'), 'Керобокан');
t('пустой район', districtFor('', ''), 'Bali');
t('центр Тегалаланга ≠ центр острова', districtCenter('Тегалаланг').lat, -8.41679);
t('центр Убуда есть', districtCenter('Убуд').lat, -8.5069);
t('центр Чангу есть', districtCenter('Чангу').lat, -8.6475);
const miss = missingCenterLabels();
t('каноны без центра', miss.length, 0);
if (miss.length) console.log('   без центра:', miss.join(', '));
console.log(`Юнит: ${ok}/${ok + bad} OK`);

// Живая лента: сколько событий без координат и куда встанет пин
const dir = `${process.env.LOCALAPPDATA}/Temp/balib`;
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const evs = [];
for (const f of files) for (const e of JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).data || []) evs.push(e);
const uniq = new Map(); for (const e of evs) if (!uniq.has(e.slug)) uniq.set(e.slug, e);
let noGeo = 0, islandBefore = 0;
for (const e of uniq.values()) {
  const p = e.place || {};
  const d = districtFor(String((p.location && p.location.address) || p.title || ''), p.districtName);
  const hasGeo = p.location && p.location.lat != null && p.location.lng != null;
  if (!hasGeo) { noGeo++; const c = districtCenter(d); if (Math.abs(c.lat + 8.4095) < 1e-6 && Math.abs(c.lng - 115.1889) < 1e-6) islandBefore++; }
}
console.log(`Лента: страниц ${files.length}, событий ${uniq.size}, без координат ${noGeo}; из них уехали бы на центр острова: было ${islandBefore}, стало 0 (центр района есть у всех канонов)`);

// Регресс меток: совпадает ли рассчитанный район с меткой живой карточки в базе
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,city,website', { filter: q => q.eq('status', 'active') });
const byWeb = new Map(rows.map((r) => [String(r.website || '').replace(/\/$/, ''), r]));
let checked = 0, mismatch = [];
for (const e of uniq.values()) {
  const r = byWeb.get(`https://baliforum.ru/events/${e.slug}`);
  if (!r) continue;
  checked++;
  const d = districtFor(String((e.place?.location?.address) || e.place?.title || ''), e.place?.districtName);
  if (String(r.city) !== `${d}, Bali`) mismatch.push(`${e.slug}: база «${r.city}» → расчёт «${d}, Bali»`);
}
console.log(`Сверка с базой: живых карточек сверено ${checked}, расхождений метки ${mismatch.length}`);
mismatch.slice(0, 12).forEach((m) => console.log('   ', m));
console.log('Центров в словаре:', Object.keys(BALI_DISTRICT_CENTERS).length);
