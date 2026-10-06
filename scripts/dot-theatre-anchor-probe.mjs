// Проба: сколько клонов серий-якорей сейчас в живых и совпадает ли ключ у пары Tiên Sa.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

function norm(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = new URL(s);
    return `${x.host.replace(/^www\./i, '').toLowerCase()}${x.pathname.replace(/\/+$/, '').toLowerCase()}${x.hash.toLowerCase()}`;
  } catch {
    return s.toLowerCase();
  }
}
function nk(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
const akey = (u, t) => { const n = norm(u); if (!n.includes('#')) return null; return `${n}|${nk(t)}`; };

const rows = await selectAll(db, 'events', 'id,title,website,city,start_date,status', {
  filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']),
});
const m = new Map();
for (const r of rows) {
  const k = akey(r.website, r.title);
  if (!k) continue;
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(r);
}
const groups = [...m.values()].filter((g) => g.length > 1);
console.log('живых с якорем в URL:', [...m.values()].flat().length, '| ключей:', m.size, '| групп с >1:', groups.length);
for (const g of groups) console.log('  группа:', g.map((r) => `${r.id.slice(0, 8)}/${r.status}/${r.start_date}`).join(' + '), '|', String(g[0].title).slice(0, 40));
for (const p of ['e92095ff', '9d5dee25', '791ef85e']) {
  const r = rows.find((x) => x.id.startsWith(p));
  console.log(' ', p, r ? `[${r.status}] ` + akey(r.website, r.title) : '(нет в живых)');
}
