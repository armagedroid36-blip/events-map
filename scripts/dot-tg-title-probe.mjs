// Читающий зонд: карточки из TG-каналов, у которых заголовок — не название события,
// а служебная строка поста (приветствие/анонс/название канала).
// node --env-file=.env scripts/dot-tg-title-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events',
  'id,status,title,title_ru,city,start_date,start_time,address,website,source_type,created_at');

const GREET = [
  /^всем\s+привет/i, /^привет[,!.\s]/i, /^привет$/i, /^здравствуй/i, /^добрый\s+(день|вечер|день|утро)/i,
  /^доброе\s+утро/i, /^друзья[,!.\s]/i, /^друзья$/i, /^дорогие\s+/i, /^внимание[,!.\s]/i,
  /^анонс[,!.:\s]/i, /^афиша[,!.:\s]/i, /^(hello|hi)[,!.\s]/i, /^уважаемые/i,
  /^хорошего\s+(дня|вечера)/i, /^напомина/i, /^‼️/, /^🔥\s*(анонс|внимание)/i,
];

const isTg = (r) => /(^|\/\/)(t\.me|telegram\.me)\//i.test(r.website || '');

const hits = [];
for (const r of rows) {
  const t = (r.title_ru || r.title || '').trim();
  if (!t) { hits.push({ kind: 'пустой заголовок', r }); continue; }
  if (!isTg(r)) continue;
  if (GREET.some((re) => re.test(t))) hits.push({ kind: 'приветствие/служебное', r });
}

const byKind = {};
for (const h of hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1;
console.log(`Всего строк: ${rows.length}; TG-строк: ${rows.filter(isTg).length}`);
console.log('Кандидаты:', JSON.stringify(byKind));
console.log('---');
for (const h of hits) {
  const r = h.r;
  console.log(`${h.kind} | ${r.status} | ${r.id.slice(0, 8)} | «${(r.title_ru || r.title || '').slice(0, 60)}» | ${r.city} | ${r.start_date} ${r.start_time || ''} | ${r.website}`);
}
