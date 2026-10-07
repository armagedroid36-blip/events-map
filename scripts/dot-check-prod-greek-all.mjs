// Проверка ПРОДА: ВСЕ карточки с греческим ЗАГОЛОВКОМ (архив + активные) отдают
// страницы без греческих букв в h1/title и с canonical на себя.
// Запуск: node --import ./scripts/dot-proxy-import.mjs scripts/dot-check-prod-greek-all.mjs
import { createClient } from '@supabase/supabase-js';
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
const rows = (await selectAll(db, 'events', 'id, title, title_ru, title_en, source_lang, status')).filter(
  (e) => GREEK.test(String(e.title)) && (e.status === 'archived' || e.status === 'active'),
);

const page = async (path) => {
  const res = await fetch(`${SITE}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } });
  const html = await res.text();
  return {
    status: res.status,
    canonical: (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '',
    h1: ((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]*>/g, '').trim(),
    title: ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim(),
  };
};

let ok = 0;
let bad = 0;
for (const ev of rows) {
  const targets = [`/event/${ev.id}/${eventSlug(ev, 'ru')}/`];
  if (eventHasEn(ev)) targets.push(`/en/event/${ev.id}/${eventSlug(ev, 'en')}/`);
  for (const path of targets) {
    const p = await page(path);
    const greek = GREEK.test(p.h1) || GREEK.test(p.title);
    if (p.status === 200 && p.canonical === `${SITE}${path}` && !greek) ok += 1;
    else {
      bad += 1;
      console.log(`  ! [${ev.status}] ${path} | ${p.status} canonical=${p.canonical === `${SITE}${path}` ? 'self' : p.canonical} greek=${greek} | h1=${p.h1.slice(0, 50)}`);
    }
  }
}
console.log(`Карточек с греческим заголовком (архив+активные): ${rows.length}`);
console.log(`Проверено страниц: ${ok + bad}, ок: ${ok}, плохо: ${bad}`);
