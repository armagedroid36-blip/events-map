// Разведка состояния данных для точки dot-events (только чтение, ничего не пишет).
// Запуск: node --env-file=.env scripts/recon-dot-events.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const FOCUS = {
  Bali: ['bali', 'denpasar', 'canggu', 'seminyak', 'ubud', 'kuta', 'nusa dua', 'sanur', 'jimbaran', 'uluwatu', 'gianyar', 'tabanan', 'bedugul', 'amed', 'sidemen'],
  'Da Nang': ['da nang', 'danang'],
  'Nha Trang': ['nha trang'],
  Cyprus: ['ayia napa', 'agia napa', 'protaras', 'paralimni', 'famagusta', 'limassol', 'nicosia', 'larnaca', 'paphos', 'cyprus'],
};

const rows = await selectAll(db, 'events', 'id, title, city, status, lat, lng, start_date, created_at, source_type, website');
console.log('ВСЕГО строк в events:', rows.length);

const byStatus = {};
for (const r of rows) byStatus[r.status || 'null'] = (byStatus[r.status || 'null'] || 0) + 1;
console.log('ПО СТАТУСАМ:', JSON.stringify(byStatus));

const byCity = {};
for (const r of rows) {
  const c = (r.city || '∅').trim().toLowerCase();
  byCity[c] = byCity[c] || { n: 0, active: 0, mod: 0, nolatlng: 0 };
  byCity[c].n++;
  if (r.status === 'active') byCity[c].active++;
  if (r.status === 'moderation') byCity[c].mod++;
  if (r.lat == null || r.lng == null) byCity[c].nolatlng++;
}
const top = Object.entries(byCity).sort((a, b) => b[1].n - a[1].n);
console.log('ГОРОДА (всего/active/moderation/без координат):');
for (const [c, v] of top.slice(0, 40)) console.log(`  ${c}: ${v.n}/${v.active}/${v.mod}/${v.nolatlng}`);

console.log('--- ГЕОФОКУС ---');
for (const [label, keys] of Object.entries(FOCUS)) {
  const hit = top.filter(([c]) => keys.some((k) => c === k || c.includes(k)));
  const sum = hit.reduce((a, [, v]) => a + v.n, 0);
  const act = hit.reduce((a, [, v]) => a + v.active, 0);
  const mod = hit.reduce((a, [, v]) => a + v.mod, 0);
  const noll = hit.reduce((a, [, v]) => a + v.nolatlng, 0);
  console.log(`${label}: всего ${sum} (active ${act}, moderation ${mod}, без коорд. ${noll}) — ${hit.map(([c, v]) => c + ':' + v.n).join(', ')}`);
}

// Пустые по геофокусу города, которые ожидаем видеть
const EXPECT = ['canggu', 'ubud', 'seminyak', 'kuta', 'sanur', 'nusa dua', 'denpasar', 'da nang', 'nha trang', 'ayia napa', 'protaras', 'paralimni', 'famagusta'];
console.log('ОЖИДАЕМЫЕ КЛЮЧИ, КОТОРЫХ НЕТ НИ В ОДНОМ city:', EXPECT.filter((e) => !top.some(([c]) => c.includes(e))).join(', ') || 'нет');

// Свежие за 7 дней (по created_at) и сколько среди них без координат
const week = rows.filter((r) => r.created_at && Date.now() - Date.parse(r.created_at) < 7 * 864e5);
console.log(`СОЗДАНО за 7 дней: ${week.length}; без координат: ${week.filter((r) => r.lat == null || r.lng == null).length}`);
const wc = {};
for (const r of week) wc[(r.city || '∅').toLowerCase()] = (wc[(r.city || '∅').toLowerCase()] || 0) + 1;
console.log('  по городам:', Object.entries(wc).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => c + ':' + n).join(', '));
