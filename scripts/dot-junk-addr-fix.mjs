// Ремонт: карточки с мусорным «адресом» из постов-источников (dot-events).
// Таблица id -> что было в поле address + цитата/ссылка поста. Ставим null (честно:
// адрес неизвестен), пин не трогаем. DRY по умолчанию, APPLY=1 — запись.
// node --env-file=.env scripts/dot-junk-addr-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress } from './address-junk.mjs';

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

// id -> ожидаемый мусорный адрес (страховка: правим только если в базе именно он)
const TARGETS = {
  '3d43defd': ['Где: Центр, локация при записи ❤️', 't.me/danang_afisha/5537'],
  '44afe829': ['Где: уточняйте у организаторов', 't.me/danang_afisha/5623'],
  '847ba8b1': ['Где: локация при записи', 't.me/danang_afisha/5626'],
  '5787224c': ['север', 't.me/nyachang_ru/23908'],
  'c9c1783d': ['мост на западе', 't.me/nyachang_ru/23990'],
  'be0fffb5': ['кольцо около Скении', 't.me/nyachang_ru/24090'],
  '6824b4b7': ['Где: уточняйте у организаторов', 't.me/danang_afisha/5701'],
  'e698c3f1': ['север (адрес отправим после записи)', 't.me/nyachang_ru/24164'],
  'cc7f598b': ['Север', 't.me/nyachang_ru/24167'],
};

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,website');
let done = 0, skipped = 0, errors = 0;
for (const [pref, [expect, quote]] of Object.entries(TARGETS)) {
  const hit = rows.find((r) => String(r.id).startsWith(pref));
  if (!hit) { console.log(`[${pref}] не найдено`); skipped++; continue; }
  if (hit.status === 'archived') { console.log(`[${pref}] archived — пропуск`); skipped++; continue; }
  if (String(hit.address) !== expect) { console.log(`[${pref}] адрес в базе другой: "${hit.address}" (ожидался "${expect}") — пропуск`); skipped++; continue; }
  if (!isJunkAddress(hit.address)) { console.log(`[${pref}] фильтр адрес адресом считает — пропуск`); skipped++; continue; }
  console.log(`${APPLY ? 'ПРАВКА' : '[dry]'} ${pref} ${hit.status} | ${hit.title_ru || hit.title} | ${hit.city} ${hit.start_date} | "${hit.address}" -> АДРЕС=НЕТ | ${quote}`);
  if (APPLY) {
    const { data, error } = await db.from('events').update({ address: null }).eq('id', hit.id).select('id,address');
    if (error || !data?.length) { console.log(`[${pref}] ОШИБКА: ${error?.message || 'ни одна строка не изменена'}`); errors++; continue; }
    done++;
  }
}
console.log(`итог: ${APPLY ? 'применено' : 'к применению'} ${done}, пропущено ${skipped}, ошибок ${errors}`);
