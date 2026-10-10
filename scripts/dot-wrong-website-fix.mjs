// Ремонт карточки, чья ссылка ведёт на страницу ДРУГОГО события источника.
// Приём: если своей страницы у источника нет (слаг 404), а сохранённая ссылка
// принадлежит другому живому событию — поле website очищается (карточка остаётся
// на карте с описанием/пином/фото, но не уводит посетителя на чужое событие).
// Страховки: карточка active, ссылка ровно ожидаемая, этой же страницей владеет
// другая живая карточка с ДРУГОЙ датой, у самой карточки дата не совпадает с датой
// в слаге страницы. DRY по умолчанию. node --env-file=.env scripts/dot-wrong-website-fix.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const LIVE = new Set(['active', 'moderation', 'needs_changes']);

const FIXES = [
  {
    id: 'ca50fa0e',
    website: 'https://cyprusnow.app/event/aproetimatos-stand-up-comedy-night-at-karanti-bar-2026-10-21',
    owner: '5782b262',
    why: 'страница Karanti Bar 21.10 (карточка 5782b262), а карточка — «The One MOM Show», Sonhe Bar, 23.10; своей страницы у CN нет (?q=one mom / krystal / sonhe -> 0, слаг-кандидаты 404, в sitemap ленты страницы нет)',
  },
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', '*');
const byId = new Map(rows.map((r) => [String(r.id).slice(0, 8), r]));

let applied = 0, errors = 0;
for (const f of FIXES) {
  const card = byId.get(f.id), owner = byId.get(f.owner);
  const stop = (m) => console.log(`ОТКЛОНЕНО ${f.id}: ${m}`);
  if (!card) { stop('карточка не найдена'); continue; }
  if (card.status !== 'active') { stop(`статус ${card.status}`); continue; }
  if (card.website !== f.website) { stop('ссылка не совпадает с ожидаемой'); continue; }
  if (!owner) { stop('карточка-владелец страницы не найдена'); continue; }
  if (!LIVE.has(owner.status)) { stop(`карточка-владелец страницы в статусе ${owner.status}`); continue; }
  if (owner.website !== f.website) { stop('владелец страницы ссылается на другую страницу'); continue; }
  if (owner.start_date === card.start_date) { stop('у обеих одна дата'); continue; }
  let slugDate = '';
  try { slugDate = (decodeURIComponent(f.website).match(/-(\d{4}-\d{2}-\d{2})\/?$/) || [])[1] || ''; } catch {}
  if (slugDate && slugDate === card.start_date) { stop('дата в слаге совпадает с датой карточки'); continue; }

  console.log(`FIX OK ${f.id}: ${card.title}`);
  console.log(`   ${card.start_date} ${card.start_time} | ${card.address} | ${card.lat},${card.lng}`);
  console.log(`   ссылка уходит: ${f.website}`);
  console.log(`   владелец страницы: ${f.owner} | ${owner.title} | ${owner.start_date}`);
  console.log(`   почему: ${f.why}`);
  if (!APPLY) { console.log('   DRY: запись не делается (APPLY=1 для применения)'); continue; }
  const { data, error } = await db.from('events').update({ website: null }).eq('id', card.id).select('id, website, status, start_date, lat, lng');
  if (error) { console.log(`   ОШИБКА: ${error.message}`); errors++; continue; }
  if (!data?.length) { console.log('   ОШИБКА: 0 строк обновлено'); errors++; continue; }
  applied++;
  console.log(`   применено: ${data[0].id.slice(0, 8)} website=${data[0].website} status=${data[0].status} start_date=${data[0].start_date} ${data[0].lat},${data[0].lng}`);
}
console.log(`Итог: применено ${applied}, ошибок ${errors}, карточек ${FIXES.length}${APPLY ? '' : ' (DRY)'}`);
