// Проверка: у каждой archived-карточки окна 04:40Z есть ли живой близнец (дата+время+город+слова названия)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const since = '2026-10-29T04:40:00Z';

const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,status,start_date,start_time,city,address,created_at');
const win = rows.filter(r => r.created_at >= since && r.status === 'archived');
const live = rows.filter(r => r.status === 'active');
const STOP = new Set(['фестиваль','концерт','вечер','шоу','лекция','выставка','детям','детский','для','детей','и','в','на','с','the','a','of','and','in','at']);

const words = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));

for (const a of win) {
  const wa = new Set(words([a.title, a.title_ru, a.title_en].filter(Boolean).join(' ')));
  const cands = live.filter(l => l.start_date === a.start_date && (l.city || '') === (a.city || ''));
  const scored = cands.map(l => {
    const wb = words([l.title, l.title_ru, l.title_en].filter(Boolean).join(' '));
    const common = wb.filter(w => wa.has(w));
    return { l, common: common.length, words: common.slice(0, 5), sameTime: (l.start_time || '') === (a.start_time || '') };
  }).filter(s => s.common >= 2 || (s.common >= 1 && s.sameTime)).sort((x, y) => y.common - x.common);
  console.log(`\nARCH ${a.id.slice(0, 8)} «${a.title_ru || a.title}» ${a.start_date} ${a.start_time || '-'} ${a.city}`);
  if (!scored.length) console.log('  БЛИЗНЕЦОВ НЕТ — ложная склейка?');
  for (const s of scored.slice(0, 3)) console.log(`  live ${s.l.id.slice(0, 8)} «${s.l.title_ru || s.l.title}» ${s.l.start_time || '-'} общих=${s.common} [${s.words.join(',')}]`);
}
