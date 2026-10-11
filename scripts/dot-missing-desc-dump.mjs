// Читающий зонд: живые карточки без описания и без title_ru (будущие), с источником.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,description,status,website,source_type,address');
const today = new Date().toISOString().slice(0, 10);
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status) && r.start_date >= today);
const noDesc = live.filter((r) => !r.description || !String(r.description).trim());
const noRu = live.filter((r) => !r.title_ru);
console.log('== БЕЗ ОПИСАНИЯ:', noDesc.length);
for (const r of noDesc) {
  const host = (() => { try { return new URL(r.website).host; } catch { return '-'; } })();
  console.log([r.id.slice(0, 8), r.start_date, r.city, host, (r.title_ru || r.title || '').slice(0, 50)].join(' | '));
}
console.log('== БЕЗ title_ru:', noRu.length);
for (const r of noRu) {
  const host = (() => { try { return new URL(r.website).host; } catch { return '-'; } })();
  console.log([r.id.slice(0, 8), r.start_date, r.city, host, (r.title || '').slice(0, 55)].join(' | '));
}
const { writeFileSync } = await import('node:fs');
writeFileSync(process.env.TEMP + '/nodesc.json', JSON.stringify(noDesc, null, 1));
