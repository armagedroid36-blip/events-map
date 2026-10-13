// Ремонт АДРЕСА живых карточек: адрес приводится к площадке ТОГО города/даты, что стоит в карточке.
// Использование: DRY — node --env-file=.env scripts/dot-cy-card-address-fix.mjs
//                запись — node --env-file=.env scripts/dot-cy-card-address-fix.mjs --apply
// Страховки: карточка живая, совпали start_date / city / старый адрес / фрагмент title / фрагмент website.
// Безопасность по дедупу: cyprus.bz-страницы карточек встречаются в множестве `websites`
// (collect-cyprus.mjs:705 проверяет его ДО вставки), поэтому правка адреса не родит дубль на следующем сборе.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const apply = process.argv.includes('--apply');

const PLAN = [
  {
    id: 'a9877216',
    titleLike: 'Teatro Angelico',
    websiteLike: 'cyprus.bz/event/34c3',
    expectStart: '2026-10-31',
    expectCity: 'Никосия, Кипр',
    expectAddress: 'Old Xydadiko, Nicosia',
    newAddress: 'Satiriko Theatre – Upper Stage, Nicosia',
    why: 'Страница события (soldoutticketbox.com event 4628 и arounder.cy/events/one-weekend-with-teatro-angelico) прямо делит тур: NICOSIA — 31.10 Satiriko Theatre – Upper Stage, LIMASSOL — 01.11 Old Xydadiko. Карточка стоит на 31.10 и в Никосии, пин 35.1632112,33.3864655 подтверждён обратным геокодингом OSM (way 47938063 «Satirikon Theatre», Morphou, Агланция, Никосия) — то есть адрес в карточке был взят от ЛИМАССОЛЬСКОГО показа того же тура.',
  },
];

const rows = await selectAll(db, 'events', 'id,status,title,city,address,lat,lng,start_date,website');
let plan = 0, done = 0, skip = 0, err = 0;
const out = [];

for (const p of PLAN) {
  const card = rows.find((r) => String(r.id).toLowerCase().startsWith(p.id));
  if (!card) { out.push(`[${p.id}] не найдена`); skip++; continue; }
  const bad = [];
  if (card.status !== 'active') bad.push(`status=${card.status}`);
  if (String(card.start_date) !== p.expectStart) bad.push(`start_date=${card.start_date}`);
  if ((card.city || '') !== p.expectCity) bad.push(`city=${card.city}`);
  if ((card.address || '') !== p.expectAddress) bad.push(`address=${card.address}`);
  if (p.titleLike && !String(card.title).toLowerCase().includes(p.titleLike.toLowerCase())) bad.push('title не совпал');
  if (p.websiteLike && !String(card.website || '').toLowerCase().includes(p.websiteLike.toLowerCase())) bad.push('website не совпал');
  if (bad.length) { out.push(`[${p.id}] пропуск: ${bad.join('; ')}`); skip++; continue; }

  plan++;
  out.push(`[${p.id}] ${card.start_date} | ${card.city} | «${card.address}» -> «${p.newAddress}»`);
  out.push(`    почему: ${p.why}`);
  if (!apply) continue;

  const { data, error } = await db.from('events')
    .update({ address: p.newAddress, updated_at: new Date().toISOString() })
    .eq('id', card.id).eq('address', p.expectAddress).select('id,address');
  if (error || !data || !data.length) { out.push(`    ОШИБКА: ${error ? error.message : 'update не применился (0 строк)'}`); err++; continue; }
  done++;
  const chk = await db.from('events').select('status,start_date,city,address,lat,lng,website').eq('id', card.id).single();
  out.push(`    контроль: ${chk.data.status} | ${chk.data.start_date} | ${chk.data.city} | «${chk.data.address}» | пин ${chk.data.lat},${chk.data.lng}`);
}

console.log(out.join('\n'));
console.log(`\n${apply ? 'ЗАПИСЬ' : 'ПЛАН'}: ${plan}, применено ${done}, пропущено ${skip}, ошибок ${err}`);
