// Читающий зонд: живые карточки без end_date, у которых название/описание намекает
// на многодневное событие (диапазон дат, фестиваль, тур). Класс "однодневный показ
// многодневного события" — проверка перед правкой end_date по странице источника.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const LIVE = ['active', 'moderation', 'needs_changes'];
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,end_date,source_type,website,description', {
  filter: q => q.in('status', LIVE),
});

const today = new Date().toISOString().slice(0, 10);
const future = rows.filter(r => (r.start_date || '') >= today);

const noEnd = future.filter(r => !r.end_date);
const withEnd = future.filter(r => r.end_date);

console.log(`живых: ${rows.length}, будущих: ${future.length}`);
console.log(`с end_date: ${withEnd.length}, БЕЗ end_date: ${noEnd.length}`);

const bySrc = {};
for (const r of noEnd) bySrc[r.source_type || '?'] = (bySrc[r.source_type || '?'] || 0) + 1;
console.log('без end_date по source_type:', JSON.stringify(bySrc));

const byCity = {};
for (const r of noEnd) byCity[r.city || '?'] = (byCity[r.city || '?'] || 0) + 1;
console.log('без end_date по городам (топ-12):', Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 12));

// признак многодневности в тексте
const re = /(\d{1,2})\s*[–—-]\s*(\d{1,2})|фестивал|festival|тур\b|tour\b|выставк|exhibition|чемпионат|championship|конференц|conference|форум|forum|неделя|week|дни\b|days\b|до \d{1,2}\s|until|серия|series/i;
const suspects = noEnd.filter(r => re.test(`${r.title || ''} ${r.title_ru || ''}`));
console.log(`\nПОДОЗРЕВАЕМЫЕ (многодневные по тексту, без end_date): ${suspects.length}`);
for (const r of suspects.slice(0, 30)) {
  console.log(`${r.id.slice(0, 8)} | ${r.start_date} | ${r.city} | ${(r.title_ru || r.title || '').slice(0, 70)} | ${(r.website || '').slice(0, 60)}`);
}
