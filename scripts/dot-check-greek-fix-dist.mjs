// Проверка СБОРКИ (dist) после правки переводов: новые адреса отдают страницу с
// переводом, прежние адреса живы как страницы-алиасы с canonical на новый URL,
// греческих букв в h1/title нет.
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-check-greek-fix-dist.mjs <slugs-before.json>
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';
import { eventHasEn, eventSlug } from '../src/lib/slug.ts';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const SITE = 'https://mypins.site';
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const before = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rows = await selectAll(
  db,
  'events',
  'id, title, title_ru, title_en, source_lang, status, start_date',
);
const byId = new Map(rows.map((r) => [r.id, r]));

const decode = (s) =>
  String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const fileOf = (path) => join('dist', path.replace(/^\//, ''), 'index.html');
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

// Оптимизация: один проход по sitemap, чтобы понимать, что вообще опубликовано
const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
const published = new Set(
  [...sitemap.matchAll(/<loc>https:\/\/mypins\.site([^<]*)<\/loc>/g)].map((m) => m[1].replace(/\/$/, '') || '/'),
);

let checkedNew = 0;
let checkedAlias = 0;
let greekPages = 0;
let aliasFail = 0;
let h1Fail = 0;
let missing = 0;
let notPublished = 0;
const problems = [];

for (const b of before) {
  const ev = byId.get(b.id);
  if (!ev) continue;
  const pairs = [{ old: `/event/${b.id}/${b.ruTail}/`, cur: `/event/${ev.id}/${eventSlug(ev, 'ru')}/`, lang: 'ru' }];
  if (b.enTail && eventHasEn(ev)) {
    pairs.push({ old: `/en/event/${b.id}/${b.enTail}/`, cur: `/en/event/${ev.id}/${eventSlug(ev, 'en')}/`, lang: 'en' });
  }
  const isTarget = GREEK.test(String(ev.title));
  for (const p of pairs) {
    const html = read(fileOf(p.cur));
    const alias = p.old !== p.cur ? read(fileOf(p.old)) : null;
    if (!html) {
      if (published.has(p.cur.replace(/\/$/, '')) || alias) {
        missing += 1;
        problems.push(`нет страницы нового адреса: ${p.cur}`);
      } else if (isTarget || ev.status === 'active') {
        missing += 1;
        problems.push(`нет ни новой страницы, ни алиаса: ${p.cur} | старое ${p.old}`);
      } else {
        notPublished += 1;
      }
      continue;
    }
    checkedNew += 1;
    const h1 = decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
    const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    if (GREEK.test(h1) || GREEK.test(title)) {
      greekPages += 1;
      problems.push(`греческие буквы в h1/title: ${p.cur} | h1=${h1.slice(0, 60)}`);
    }
    if (isTarget) {
      const expect = decode(p.lang === 'en' ? ev.title_en || ev.title : ev.title_ru || ev.title);
      if (expect && !h1.includes(expect.slice(0, 20))) {
        h1Fail += 1;
        problems.push(`h1 не совпал с переводом: ${p.cur} | h1=${h1.slice(0, 60)} | ждали «${expect.slice(0, 50)}»`);
      }
    }
    if (alias) {
      const canon = (alias.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
      if (canon !== `${SITE}${p.cur}`) {
        aliasFail += 1;
        problems.push(`canonical алиаса не туда: ${p.old} → ${canon}`);
      } else checkedAlias += 1;
    }
  }
}

console.log(`Новых страниц проверено: ${checkedNew}`);
console.log(`Алиасов с верным canonical: ${checkedAlias}, провалов: ${aliasFail}`);
console.log(`h1 не совпал с переводом (только греческие карточки): ${h1Fail}`);
console.log(`Страниц с греческим в h1/title: ${greekPages}`);
console.log(`Пропущено страниц: ${missing}, не публикуется вовсе: ${notPublished}`);
console.log(`Проблем: ${problems.length}`);
for (const p of problems.slice(0, 25)) console.log(`  ! ${p}`);
