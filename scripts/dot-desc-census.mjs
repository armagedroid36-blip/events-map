// Читающий зонд: перепись поля description у живых карточек (класс «описание = не описание»).
// Ищет в описании сырой пост: ссылки t.me, хэштеги, "пиши в лс", цена-ярлык, телефон,
// пустое/слишком короткое описание, описание == заголовок.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(
  db,
  'events',
  'id,title,title_ru,description,description_ru,city,source_type,status,website,start_date',
  { filter: (q) => q.eq('status', 'active') },
);

const live = rows.map((r) => {
  const d = String(r.description_ru || r.description || '').trim();
  const t = String(r.title_ru || r.title || '').trim();
  return { id: String(r.id).slice(0, 8), t, d, city: r.city, src: r.source_type };
});

const JUNK = [
  ['t.me-ссылка', /t\.me\//i],
  ['хэштег', /#[A-Za-zА-Яа-яЁё_]{3,}/],
  ['в лс/личку', /\b(в\s+лс|в\s+личку|пиши|пишите|напиши|напишите)\b/i],
  ['цена-ярлык', /^\s*(стоимость|цена|вход|билеты)\s*[:\-]/i],
  ['телефон', /\+?\d[\d\s\-()]{7,}\d/],
  ['без букв (только эмодзи/знаки)', /^[^\p{L}\p{N}]+$/u],
];

console.log(`ЖИВЫХ: ${live.length}`);
const noDesc = live.filter((r) => !r.d);
const shortD = live.filter((r) => r.d && r.d.length < 20);
const sameTitle = live.filter((r) => r.d && r.d === r.t);
console.log(`пустое описание: ${noDesc.length} | короче 20 знаков: ${shortD.length} | = заголовку: ${sameTitle.length}`);
for (const [name, re] of JUNK) {
  const hit = live.filter((r) => r.d && re.test(r.d));
  console.log(`«${name}»: ${hit.length}`);
  for (const r of hit.slice(0, 5)) {
    console.log(`   ${r.id} [${r.src}] ${r.city} | ${r.t.slice(0, 40)} | ${JSON.stringify(r.d.slice(0, 130))}`);
  }
}
if (noDesc.length) {
  console.log('--- без описания ---');
  for (const r of noDesc) console.log(`   ${r.id} [${r.src}] ${r.city} | ${r.t.slice(0, 60)}`);
}
if (shortD.length) {
  console.log('--- короткие ---');
  for (const r of shortD.slice(0, 10)) console.log(`   ${r.id} ${r.city} | ${JSON.stringify(r.d.slice(0, 80))}`);
}
const lens = live.filter((r) => r.d).map((r) => r.d.length).sort((a, b) => a - b);
if (lens.length) {
  const q = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
  console.log(`длина: p10 ${q(0.1)} / медиана ${q(0.5)} / p90 ${q(0.9)} / max ${lens[lens.length - 1]}`);
}
