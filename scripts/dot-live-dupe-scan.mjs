// Масштаб класса «живые дубли одного события»: пары с одинаковым днём+городом,
// где названия (ru/en/orig) пересекаются по значимым словам ИЛИ совпадает нормализованный адрес.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,status,website,source_type');
const live = all.filter((r) => r.status === 'active');
const stop = new Set(['фестиваль', 'festival', '2026', 'bali', 'the', 'and', 'для', 'в', 'на', 'по', 'и', 'с', 'день', 'night', 'day', 'ночь']);
const words = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));
const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const aliases = (r) => [r.title, r.title_ru, r.title_en].filter(Boolean);

const groups = new Map();
for (const r of live) {
  const k = `${(r.start_date || '').slice(0, 10)}|${norm(r.city).replace(/, кипр|, bali/, '')}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
let pairs = 0;
const shown = [];
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    let overlap = 0;
    for (const wa of aliases(a)) for (const wb of aliases(b)) {
      const sa = new Set(words(wa)), sb = new Set(words(wb));
      let n = 0; for (const w of sa) if (sb.has(w)) n++;
      overlap = Math.max(overlap, n);
    }
    const addrEq = norm(a.address) && norm(a.address) === norm(b.address);
    const sameSrc = (() => { try { const ua = new URL(a.website || ''), ub = new URL(b.website || ''); return ua.host === ub.host && norm(ua.pathname) === norm(ub.pathname); } catch { return false; } })();
    if (overlap >= 2 || addrEq || sameSrc) {
      pairs++;
      shown.push(`${k} | ${(a.title_ru || a.title).slice(0, 40)} [${a.id.slice(0, 8)}] <> ${(b.title_ru || b.title).slice(0, 40)} [${b.id.slice(0, 8)}] | слов ${overlap}${addrEq ? ' адрес=' : ''}${sameSrc ? ' url=' : ''} | ${a.source_type}/${b.source_type}`);
    }
  }
}
console.log(`ACTIVE ${live.length}; подозрительных пар: ${pairs}`);
for (const s of shown.slice(0, 40)) console.log('  ', s);
