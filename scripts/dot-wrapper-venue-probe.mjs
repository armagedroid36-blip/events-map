// Зонд класса «карточка-обёртка тура»: живая карточка с адресом уровня «весь остров /
// несколько площадок» — такая карточка на карте врёт и городом, и пином (кейс 326:
// bz «The Seven Little Goats… Tour Across Cyprus», метка Фамагуста, пин на её константе,
// тогда как площадка была одна — Pattichio Theatre, Лимасол).
// Норма 0: такие записи дублируют по-городские карточки того же тура.
// Проверка: node --env-file=.env scripts/dot-wrapper-venue-probe.mjs
import { selectAll } from './db-rows.mjs';
import { createClient } from '@supabase/supabase-js';

export const WRAPPER = /multiple\s+venues|across\s+cyprus|various\s+venues|several\s+venues|all\s+over\s+cyprus|σε\s+όλη\s+την\s+κύπρο|πανκύπρι|pan-?cyprian|по\s+всему\s+кипру|разные\s+площадки/i;

export function isWrapperVenue(addr) {
  return !!addr && WRAPPER.test(String(addr));
}

const LIVE = ['active', 'moderation', 'needs_changes'];

export async function probe(db, statuses = LIVE) {
  const rows = await selectAll(db, 'events', 'id,status,city,address,title,title_ru,start_date,end_date,website,lat,lng', {});
  const live = rows.filter(r => statuses.includes(r.status));
  return { total: rows.length, live: live.length, hits: live.filter(r => isWrapperVenue(r.address)) };
}

if (process.env.PROBE_NO_RUN !== '1') {
  const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const { total, live, hits } = await probe(db);
  console.log(`всего ${total} | живых ${live} | карточек-обёрток: ${hits.length}`);
  for (const r of hits) console.log('  ', r.id.slice(0, 8), r.status, '|', (r.title_ru || r.title).slice(0, 60), '|', r.city, '|', r.address);
  console.log(hits.length === 0 ? 'НОРМА 0 — ok' : 'ВНИМАНИЕ: сверять JSON-LD страницы источника и архивировать как копию');
}
