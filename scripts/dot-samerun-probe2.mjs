// Проверка карточки 62e11b0f (архив в том же прогоне 37923883978, 2026-10-09T11:27Z):
// есть ли у неё живой близнец (тот же день + пересечение слов названия). Читающий.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,start_date,start_time,city,address,lat,lng,website,status,created_at,updated_at');
const tgt = rows.find((r) => String(r.id).startsWith('62e11b0f'));
console.log('цель:', tgt && `${tgt.id.slice(0, 8)} ${tgt.status} ${tgt.start_date} ${tgt.start_time} | ${tgt.title} | ${tgt.address} | ${tgt.website}`);

const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-zа-яё0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4));
const T = new Set([...toks(tgt.title), ...toks(tgt.title_ru), ...toks(tgt.title_en)]);
console.log('значимые слова цели:', [...T].join(' '));

const sameDay = rows.filter((r) => r.start_date === tgt.start_date && r.status !== 'archived' && String(r.id) !== String(tgt.id));
console.log(`\nживых карточек на ${tgt.start_date}: ${sameDay.length}`);
for (const r of sameDay) {
  const R = new Set([...toks(r.title), ...toks(r.title_ru), ...toks(r.title_en)]);
  let ov = 0;
  for (const t of R) if (T.has(t)) ov++;
  if (ov >= 1) console.log(`  ${r.id.slice(0, 8)} [${r.status}] общих ${ov} | ${r.title} | ${r.address} | ${r.website}`);
}

// тот же клуб/площадка в живых вообще
const club = rows.filter((r) => r.status !== 'archived' && /спичк|волшебн/i.test(`${r.title} ${r.title_ru} ${r.title_en}`));
console.log(`\nживых карточек про «спичку»: ${club.length}`);
for (const r of club) console.log(`  ${r.id.slice(0, 8)} [${r.status}] ${r.start_date} ${r.start_time} | ${r.title} | ${r.city}`);
