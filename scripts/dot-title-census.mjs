// Читающий зонд: перепись поля title/title_ru у живых карточек (класс «заголовок = не заголовок»).
// Раньше считался только подкласс «заголовок-приветствие» (dot-tg-title-probe).
// Здесь — остальные симптомы: эмодзи/хэштеги/ссылки/телефон/перенос строки в заголовке,
// слишком длинный или слишком короткий заголовок, КАПС, пустой title_ru.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(
  db,
  'events',
  'id,title,title_ru,title_en,city,source_type,status,website,start_date',
  { filter: (q) => q.eq('status', 'active') },
);

const live = rows.map((r) => ({
  id: String(r.id).slice(0, 8),
  t: String(r.title_ru || r.title || '').trim(),
  tRaw: String(r.title || '').trim(),
  tru: String(r.title_ru || '').trim(),
  city: r.city,
  src: r.source_type,
}));

const CHECKS = [
  ['эмодзи в заголовке', (r) => /\p{Extended_Pictographic}/u.test(r.t)],
  ['хэштег', (r) => /#[A-Za-zА-Яа-яЁё_]{3,}/.test(r.t)],
  ['ссылка в заголовке', (r) => /(https?:\/\/|t\.me\/|www\.)/i.test(r.t)],
  ['телефон', (r) => /\+?\d[\d\s\-()]{8,}\d/.test(r.t)],
  ['перенос строки', (r) => /\n/.test(r.t)],
  ['длиннее 120', (r) => r.t.length > 120],
  ['короткий < 6', (r) => r.t.length > 0 && r.t.length < 6],
  ['КАПС (>=10 знаков, >70% заглавных)', (r) => {
    const letters = r.t.replace(/[^\p{L}]/gu, '');
    if (letters.length < 10) return false;
    const up = (letters.match(/\p{Lu}/gu) || []).length;
    return up / letters.length > 0.7;
  }],
  ['нет title_ru (есть title)', (r) => !r.tru && !!r.tRaw],
  ['title = город', (r) => {
    const c = String(r.city || '').split(',')[0].trim().toLowerCase();
    return !!c && r.t.toLowerCase() === c;
  }],
];

console.log(`ЖИВЫХ: ${live.length}`);
for (const [name, fn] of CHECKS) {
  const hit = live.filter(fn);
  console.log(`\n«${name}»: ${hit.length}`);
  for (const r of hit.slice(0, 6)) {
    console.log(`   ${r.id} [${r.src}] ${r.city} | ${JSON.stringify(r.t.slice(0, 110))}`);
  }
}

const lens = live.map((r) => r.t.length).sort((a, b) => a - b);
const q = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
console.log(`\nдлина заголовка: p10 ${q(0.1)} / медиана ${q(0.5)} / p90 ${q(0.9)} / max ${lens[lens.length - 1]}`);
