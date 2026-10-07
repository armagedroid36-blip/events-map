// Перепись фото у живых карточек: источник -> всего / с фото / без.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id, source_type, website, photos', { filter: (q) => q.eq('status', 'active') });
const by = new Map();
for (const r of rows) {
  const k = r.source_type || '(нет)';
  const s = by.get(k) || { n: 0, photo: 0 };
  s.n++;
  if (Array.isArray(r.photos) && r.photos.filter(Boolean).length) s.photo++;
  by.set(k, s);
}
console.log('живых:', rows.length);
for (const [k, s] of [...by].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${k.padEnd(12)} всего ${String(s.n).padStart(5)} | с фото ${String(s.photo).padStart(5)} | без фото ${String(s.n - s.photo).padStart(5)}`);
}
const noPhoto = rows.filter((r) => !(Array.isArray(r.photos) && r.photos.filter(Boolean).length));
const hosts = new Map();
for (const r of noPhoto) {
  let h = 'нет website';
  try { h = new URL(r.website).host; } catch {}
  hosts.set(h, (hosts.get(h) || 0) + 1);
}
console.log('без фото по домену:', [...hosts].sort((a, b) => b[1] - a[1]).slice(0, 12));
