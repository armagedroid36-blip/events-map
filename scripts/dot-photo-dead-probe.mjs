#!/usr/bin/env node
// Зонд класса «живая карточка, у которой ВСЕ фото битые»: ссылки на картинки умирают
// после сбора (источник сменил страницу/файл), витрина показывает пустую галерею.
// Норма 0. Дефект = карточка active/moderation, где каждый элемент photos либо не-URL
// (голое имя файла), либо отдаёт 404/410. Сетевые ошибки (URLError, 5xx, Cloudflare 54x)
// дефектом НЕ считаются — это блокировка/перегрузка, а не мёртвый файл.
//
// Запуск: node --env-file=.env scripts/dot-photo-dead-probe.mjs
//         APPLY=1 ... — очистить photos у найденных карточек (страховка: статус живой).
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const APPLY = process.env.APPLY === '1';
const CONC = Number(process.env.CONC) || 16;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let all = [], from = 0;
for (;;) {
  const { data, error } = await db.from('events').select('id,title,status,city,photos').in('status', ['active', 'moderation']).range(from, from + 999);
  if (error) throw error;
  all = all.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}
const withPhotos = all.filter(e => Array.isArray(e.photos) && e.photos.length);
const urls = [...new Set(withPhotos.flatMap(e => e.photos).filter(u => typeof u === 'string' && u.startsWith('http')))];

async function head(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Range: 'bytes=0-1023' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return [u, r.status];
  } catch {
    return [u, 0]; // сеть/таймаут — не доказательство смерти
  }
}

const dead = new Set();
let i = 0;
async function worker() {
  while (i < urls.length) {
    const u = urls[i++];
    const [, st] = await head(u);
    if (st === 404 || st === 410) dead.add(u);
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, urls.length) }, worker));

const bad = withPhotos.filter(e => {
  const ps = e.photos.filter(u => typeof u === 'string');
  const ok = ps.filter(u => u.startsWith('http') && !dead.has(u));
  return ps.length > 0 && ok.length === 0;
});
console.log(`живых: ${all.length}, с фото: ${withPhotos.length}, URL: ${urls.length}, мёртвых 404/410: ${dead.size}`);
console.log(`карточек, где все фото мертвы или не-URL: ${bad.length}`);
for (const e of bad) console.log(`  ${e.id.slice(0, 8)} ${e.status} ${e.city} | ${(e.title || '').slice(0, 45)} | ${JSON.stringify(e.photos).slice(0, 110)}`);

if (APPLY && bad.length) {
  for (const e of bad) {
    const { data: upd, error } = await db.from('events').update({ photos: [] }).eq('id', e.id).in('status', ['active', 'moderation']).select('id,status,photos,start_date,city');
    if (error) { console.error('  ОШИБКА', e.id.slice(0, 8), error.message); continue; }
    console.log('  очищено:', JSON.stringify(upd));
  }
}
