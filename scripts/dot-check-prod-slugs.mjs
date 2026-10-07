// Проверка ПРОДА после деплоя по ВСЕМ изменившимся адресам: новый адрес отдаёт
// страницу с переводом (200, canonical self, без греческого в h1/title), прежний
// адрес жив как страница-алиас с canonical на новый.
// Запуск: node --import ./scripts/dot-proxy-import.mjs scripts/dot-check-prod-slugs.mjs <slugs-before.json>
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
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
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const before = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rows = await selectAll(db, 'events', 'id, title, title_ru, title_en, source_lang, status');
const byId = new Map(rows.map((r) => [r.id, r]));

const page = async (path) => {
  const res = await fetch(`${SITE}${path}`, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  return {
    status: res.status,
    canonical: (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '',
    h1: ((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/g, ' ').trim(),
    title: ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim(),
  };
};

let newOk = 0;
let aliasOk = 0;
let newBad = 0;
let aliasBad = 0;
const problems = [];
for (const b of before) {
  const ev = byId.get(b.id);
  if (!ev) continue;
  const pairs = [{ old: `/event/${b.id}/${b.ruTail}/`, cur: `/event/${ev.id}/${eventSlug(ev, 'ru')}/` }];
  if (b.enTail && eventHasEn(ev)) pairs.push({ old: `/en/event/${b.id}/${b.enTail}/`, cur: `/en/event/${ev.id}/${eventSlug(ev, 'en')}/` });
  for (const p of pairs) {
    if (p.old === p.cur) continue;
    const n = await page(p.cur);
    const greek = GREEK.test(n.h1) || GREEK.test(n.title);
    if (n.status === 200 && n.canonical === `${SITE}${p.cur}` && !greek) newOk += 1;
    else {
      newBad += 1;
      problems.push(`новый адрес: ${p.cur} | ${n.status} canonical=${n.canonical === `${SITE}${p.cur}` ? 'self' : n.canonical} greek=${greek} h1=${n.h1.slice(0, 40)}`);
    }
    const a = await page(p.old);
    if (a.status === 200 && a.canonical === `${SITE}${p.cur}`) aliasOk += 1;
    else {
      aliasBad += 1;
      problems.push(`алиас: ${p.old} | ${a.status} canonical=${a.canonical}`);
    }
  }
}
console.log(`Новых адресов на проде ок: ${newOk}, плохо: ${newBad}`);
console.log(`Алиасов ок: ${aliasOk}, плохо: ${aliasBad}`);
for (const p of problems.slice(0, 20)) console.log(`  ! ${p}`);
