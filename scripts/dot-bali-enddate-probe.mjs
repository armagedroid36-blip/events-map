// Читающий зонд: у ленты Бали (baliforum) событие имеет eventDates[]; проверяем,
// не теряет ли сборщик диапазон (в ленте несколько дат / пара start-end, в базе end_date пуст).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execSync } from 'node:child_process';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

function feed(page) {
  const out = execSync(`curl -s -x http://127.0.0.1:10809 --max-time 25 "https://baliforum.ru/api/v1/events?defaultList=1&page=${page}"`, { maxBuffer: 1 << 28 });
  return JSON.parse(out.toString('utf8'));
}

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,end_date,status,source_type', {
  filter: q => q.in('status', ['active', 'moderation', 'needs_changes']),
});
const bali = rows.filter(r => (r.city || '').includes('Bali') || (r.city || '').includes('Bali,'));
console.log(`живых Бали: ${bali.length}`);

let multiInFeed = 0, lost = 0;
for (let page = 1; page <= 4; page++) {
  const d = feed(page);
  const evs = d.data || [];
  if (!evs.length) break;
  for (const e of evs) {
    const dates = (e.eventDates || []).map(x => String(x.startAt || '').slice(0, 10)).filter(Boolean).sort();
    if (dates.length < 2) continue;
    multiInFeed++;
    const t = (e.title || '').slice(0, 45);
    const card = bali.find(r => `${r.title_ru || ''} ${r.title || ''}`.includes(t.slice(0, 25)));
    if (card && !card.end_date) {
      lost++;
      console.log(`ПОТЕРЯ? ${card.id.slice(0, 8)} | база ${card.start_date} → ${card.end_date || 'НЕТ'} | лента ${dates[0]} … ${dates[dates.length - 1]} (${dates.length}) | ${t}`);
    }
  }
}
console.log(`событий ленты с несколькими датами: ${multiInFeed}, из них похоже потерян диапазон: ${lost}`);
