// Диагностика пары карточек под строгий ключ живого дубля (scripts/live-dupe-key.mjs).
// Запуск: node --env-file=.env scripts/dot-probe-live-dupe-pair.mjs "<ILIKE для первой>" "<ILIKE для второй>"
import { createClient } from '@supabase/supabase-js';
import * as L from './live-dupe-key.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const [p1, p2] = process.argv.slice(2);
const { data: a } = await db.from('events').select('*').ilike('title', p1).limit(1);
const { data: b } = await db.from('events').select('*').ilike('title', p2).limit(1);
const x = a[0], y = b[0];
for (const r of [x, y]) console.log(r.id.slice(0, 8), r.status, '|', r.title, '|', r.title_ru, '|', r.title_en, '|', r.address, r.lat, r.lng);
console.log('words x:', L.words(x.title_ru || x.title), '\nwords y:', L.words(y.title_ru || y.title));
console.log('overlap =', L.overlap(x, y), '| samePlace =', L.samePlace(x, y));
console.log('dayKey:', L.dayKey(x), '||', L.dayKey(y), '| match =', L.liveDupeMatch(x, y));
