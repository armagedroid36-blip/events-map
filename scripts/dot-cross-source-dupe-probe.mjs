// Класс «одно событие — две афиши с РАЗНЫМИ адресами» (живые дубли, которых не видит штатный дедуп).
// Признак: один день + один город, названия (orig/ru/en) пересекаются по >=2 значимым словам,
// адреса НЕ равны, но пины ближе 1500 м. Именно так выглядит пара из разных источников
// (cyprus.bz RU ↔ cyprusnow EN): адрес записан разными языками ('Технополис 20, Пафос' ↔
// 'Technopolis 20'), ключ title|start_date расходится (RU-перевод ↔ EN-название), а liveDupeMatch
// требует равного адреса и слеп. Разбор пар — в руках точки: пины/даты/зал сверять по страницам
// источников, затем keep/drop в scripts/dot-lang-dupe-fix.mjs (DRY -> APPLY=1).
// Запуск: node --env-file=.env scripts/dot-cross-source-dupe-probe.mjs
// Класс 259: «одно событие — две афиши с РАЗНЫМИ адресами».
// Кандидат: один день + один город, названия пересекаются по >=2 значимым словам,
// адреса РАЗНЫЕ, но пины рядом (< 1500 м) — штатный дедуп такое не видит (liveDupeMatch требует равный адрес).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,lat,lng,start_date,status,website,source_type');
const live = all.filter((r) => r.status === 'active' && r.lat && r.lng);
const stop = new Set(['фестиваль', 'festival', '2026', '2027', 'bali', 'the', 'and', 'для', 'в', 'на', 'по', 'и', 'с', 'день', 'night', 'day', 'ночь', 'шоу', 'show', 'live', 'концерт', 'выставка', 'вечеринка', 'party']);
const words = (s) => new Set((s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)));
const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const aliases = (r) => [r.title, r.title_ru, r.title_en].filter(Boolean);
const dist = (a, b) => {
  const dx = (a.lat - b.lat) * 111320, dy = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
};
const groups = new Map();
for (const r of live) {
  const k = `${(r.start_date || '').slice(0, 10)}|${norm(r.city)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const shown = [];
for (const [k, g] of groups) {
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    const sa = new Set(), sb = new Set();
    for (const al of aliases(a)) for (const t of words(al)) sa.add(t);
    for (const al of aliases(b)) for (const t of words(al)) sb.add(t);
    let ov = 0; for (const w of sa) if (sb.has(w)) ov++;
    if (ov < 2) continue;
    const addrSame = norm(a.address) === norm(b.address);
    const d = dist(a, b);
    if (!addrSame && d < 1500) {
      shown.push({ k, ov, d: Math.round(d), a, b });
    }
  }
}
shown.sort((x, y) => y.ov - x.ov || x.d - y.d);
console.log(`ACTIVE с гео ${live.length}; кандидатов «разный адрес, пины рядом»: ${shown.length}`);
for (const s of shown.slice(0, 25)) {
  console.log(`  ${s.k} | ov ${s.ov} | ${s.d} м`);
  for (const r of [s.a, s.b]) console.log(`     ${r.id.slice(0, 8)} [${r.source_type}] ${(r.title_ru || r.title).slice(0, 60)} | ${r.address} | ${r.lat},${r.lng} | ${(r.website || '').slice(0, 70)}`);
}
