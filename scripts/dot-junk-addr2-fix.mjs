// Ремонт: живые карточки, у которых в address лежит не адрес, а «отговорка»
// (по РЕАЛЬНОМУ фильтру address-junk.mjs, а не по регуляркам разового зонда).
// Таблица id -> ожидаемая строка (страховка: правим только если в базе именно она)
// + ссылка на пост-источник. Ставим address=null, пин не трогаем.
// node --env-file=.env scripts/dot-junk-addr2-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress } from './address-junk.mjs';

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const TARGETS = {
  '0fa641c3': ['Где: локация после регистрации', 't.me/nyachang_ru/24236'],
  '9a6dc8bb': ['Центр', 't.me/nyachang_ru/24258 (backfill-address записал сырой ответ LLM)'],
  '157b225b': ['Центр (пришлем в личные сообщения)', 't.me/nyachang_ru/24207'],
  '1b988fc3': ['Центр, локация — после записи', 't.me/nyachang_ru/24157'],
  '5c572ad0': ['центр', 't.me/nyachang_ru/24110'],
  '87f768d2': ['ЦЕНТР', 't.me/nyachang_ru/23947'],
  '965f5ced': ['центр', 't.me/nyachang_ru/24123'],
  '978dbee2': ['TBA', 'elevenblueevents.com (Bank of Cyprus Nicosia Marathon)'],
  '9b1e3389': ['Север Нячанга. Локация после записи. Комфортный зал с двумя кондерами', 't.me/nyachang_ru/23974'],
  'b9a0657f': ['проведения после регистрации', 't.me/nyachang_ru/23653'],
};

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,website');
let done = 0, skipped = 0, errors = 0;
for (const [pref, [expect, quote]] of Object.entries(TARGETS)) {
  const hit = rows.find((r) => String(r.id).startsWith(pref));
  if (!hit) { console.log(`[${pref}] не найдено`); skipped++; continue; }
  if (hit.status === 'archived') { console.log(`[${pref}] archived — пропуск`); skipped++; continue; }
  if (String(hit.address) !== expect) { console.log(`[${pref}] адрес в базе другой: "${hit.address}" (ожидался "${expect}") — пропуск`); skipped++; continue; }
  if (!isJunkAddress(hit.address)) { console.log(`[${pref}] фильтр адрес адресом считает — пропуск`); skipped++; continue; }
  console.log(`${APPLY ? 'ПРАВКА' : '[dry]'} ${pref} ${hit.status} | ${hit.title_ru || hit.title} | ${hit.city} ${hit.start_date} | гео=${hit.lat},${hit.lng} | "${hit.address}" -> АДРЕС=НЕТ | ${quote}`);
  if (APPLY) {
    const { data, error } = await db.from('events').update({ address: null }).eq('id', hit.id).select('id,address');
    if (error || !data?.length) { console.log(`[${pref}] ОШИБКА: ${error?.message || 'ни одна строка не изменена'}`); errors++; continue; }
    done++;
  }
}
console.log(`итог: ${APPLY ? 'применено' : 'к применению'} ${done}, пропущено ${skipped}, ошибок ${errors}`);
