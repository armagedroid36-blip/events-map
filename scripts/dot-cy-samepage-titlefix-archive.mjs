// Ремонт дубля «та же страница источника, ЗАГОЛОВОК правился агрегатором»:
// одна страница Cyprus Now дала две живые карточки одного события, а штатный
// дедуп их не видит (адреса у карточек разные).
// Таблица PAIRS: keep — оставляемая (совпадает со страницей по названию и фото),
// drop — вставленная повторно. Страховки: обе active, ровно эта страница у обеих,
// одна дата и одно время начала, пины в допуске 0.003°, ≥3 общих значимых слова
// в названиях, третьей живой карточки на этой странице нет.
// DRY по умолчанию, APPLY=1 — запись. Запуск: node --env-file=.env scripts/dot-cy-samepage-titlefix-archive.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const LIVE = new Set(['active', 'moderation', 'needs_changes']);

const PAIRS = [
  {
    keep: 'b2cc4009', // Street Food & Art Festival: 5th Edition in Palaichori
    drop: '6f409d1b', // Street Food & Art festival
    website: 'https://cyprusnow.app/event/street-food-art-festival-5th-edition-in-palaichori-2026-10-10',
    tol: 0.003,
    note: 'страница 5th Edition in Palaichori, 10.10.2026 15:00; у оставляемой фотография источника (eventor-images), у повторной — картинка чужой статьи',
  },
];

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w.length > 3);
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', '*');
const byId = new Map(rows.map((r) => [String(r.id).slice(0, 8), r]));

let applied = 0, errors = 0;
for (const p of PAIRS) {
  const keep = byId.get(p.keep), drop = byId.get(p.drop);
  const stop = (msg) => { console.log(`ОТКЛОНЕНО ${p.keep}/${p.drop}: ${msg}`); };
  if (!keep || !drop) { stop('карточка не найдена'); continue; }
  if (!LIVE.has(keep.status) || drop.status !== 'active') { stop(`статусы keep=${keep.status} drop=${drop.status}`); continue; }
  if (keep.website !== p.website || drop.website !== p.website) { stop('ссылка страницы не совпадает у обеих'); continue; }
  if (keep.start_date !== drop.start_date) { stop(`даты разные (${keep.start_date} / ${drop.start_date})`); continue; }
  if (String(keep.start_time).slice(0, 5) !== String(drop.start_time).slice(0, 5)) { stop(`время начала разное (${keep.start_time} / ${drop.start_time})`); continue; }
  const d = Math.abs(Number(keep.lat) - Number(drop.lat)), dl = Math.abs(Number(keep.lng) - Number(drop.lng));
  if (!(d <= p.tol && dl <= p.tol)) { stop(`пины далеко (${d.toFixed(5)}, ${dl.toFixed(5)})`); continue; }
  const wk = new Set(norm(keep.title));
  const ov = norm(drop.title).filter((w) => wk.has(w)).length;
  if (ov < 3) { stop(`общих значимых слов ${ov}`); continue; }
  const third = rows.filter((r) => String(r.id).slice(0, 8) !== p.keep && String(r.id).slice(0, 8) !== p.drop && LIVE.has(r.status) && r.website === p.website);
  if (third.length) { stop(`третья живая карточка на этой странице: ${third.map((t) => String(t.id).slice(0, 8)).join(', ')}`); continue; }

  console.log(`ПАРА OK ${p.keep} (keep) <- ${p.drop} (archive)`);
  console.log(`   keep: ${keep.title} | ${keep.start_date} ${keep.start_time} | ${keep.address} | ${keep.lat},${keep.lng} | фото ${(keep.photos || []).length}`);
  console.log(`   drop: ${drop.title} | ${drop.start_date} ${drop.start_time} | ${drop.address} | ${drop.lat},${drop.lng} | фото ${(drop.photos || []).length}`);
  console.log(`   общих значимых слов ${ov}, сдвиг пина ${(Math.hypot(d, dl) * 111000).toFixed(0)} м`);
  console.log(`   ${p.note}`);
  if (!APPLY) { console.log('   DRY: запись не делается (APPLY=1 для применения)'); continue; }
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', drop.id).select('id, status');
  if (error) { console.log(`   ОШИБКА: ${error.message}`); errors++; continue; }
  if (!data?.length) { console.log('   ОШИБКА: 0 строк обновлено'); errors++; continue; }
  applied++;
  console.log(`   применено: ${data[0].id.slice(0, 8)} -> ${data[0].status}`);
}
console.log(`Итог: применено ${applied}, ошибок ${errors}, пар ${PAIRS.length}${APPLY ? '' : ' (DRY)'}`);
