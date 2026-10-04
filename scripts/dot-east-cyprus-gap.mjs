// Пробел покрытия Восточного Кипра: что есть в лентах источников и чего нет в базе.
// Только чтение. Запуск: node --env-file=.env scripts/dot-east-cyprus-gap.mjs
// Питфол (04.10.2026): с RU-IP ответ Cyprus Now по крупному городу (famagusta)
// обрывается на ~14 КБ — узел Node кидает ERR «terminated», а curl отдаёт битый
// (незакрытый) JSON. Для больших городов снимать ответ curl-ом и сверять
// scripts/dot-cn-check.mjs <файл>; маленькие города (protaras/paralimni) читаются и в узле.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const EAST = ['Ая-Напа', 'Протарас', 'Паралимни', 'Фамагуста'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36';

const rows = await selectAll(db, 'events', 'id,title,city,status,start_date,website');
console.log(`в базе всего ${rows.length}`);

const cityOf = (r) => String(r.city || '').split(',')[0].trim();
console.log('--- база: Восточный Кипр по городам/статусам ---');
for (const c of EAST) {
  const mine = rows.filter((r) => cityOf(r) === c);
  const by = {};
  for (const r of mine) by[r.status] = (by[r.status] || 0) + 1;
  console.log(`  ${c}: всего ${mine.length} [${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}]`);
}

const dbSite = new Set(rows.map((r) => r.website).filter(Boolean));
const dbKey = new Set(rows.map((r) => `${String(r.title || '').trim()}|${r.start_date}`));

async function get(url, ms = 45000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/html;q=0.9,*/*;q=0.8' }, signal: c.signal });
    return await res.text();
  } finally { clearTimeout(t); }
}

console.log('--- Cyprus Now ---');
for (const slug of ['famagusta', 'protaras', 'paralimni']) {
  let events = [];
  try {
    const j = JSON.parse(await get(`https://cyprusnow.app/api/events?city=${slug}&limit=200`));
    events = j?.events || [];
  } catch (e) { console.log(`  ${slug}: ошибка ${e.message}`); continue; }
  const stat = {};
  let missing = 0;
  const samples = [];
  for (const ev of events) {
    const c = String(ev.city || slug).toLowerCase();
    stat[c] = (stat[c] || 0) + 1;
    const w = ev.url || (ev.slug ? `https://cyprusnow.app/event/${ev.slug}` : null);
    const k = `${String(ev.title || ev.name || '').trim()}|${String(ev.start_at || ev.start_date || '').slice(0, 10)}`;
    if (!dbSite.has(w) && !dbKey.has(k)) {
      missing++;
      if (samples.length < 6) samples.push(`${String(ev.title || ev.name).slice(0, 45)} | ${k.split('|')[1]} | ${ev.venue_name || '—'} | ${ev.city || slug}`);
    }
  }
  console.log(`  ${slug}: в ленте ${events.length} ${JSON.stringify(stat)}; НЕ в базе ${missing}`);
  for (const s of samples) console.log(`     + ${s}`);
}

console.log('--- Cyprus.BZ афиши городов ---');
for (const slug of ['protaras', 'paralimni', 'ayia-napa', 'famagusta']) {
  let html = '';
  try { html = await get(`https://cyprus.bz/events/${slug}`, 30000); } catch (e) { console.log(`  ${slug}: ошибка ${e.message}`); continue; }
  const out = [];
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const stack = [JSON.parse(m[1])];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) stack.push(...n);
        else if (n && typeof n === 'object') {
          if (n['@type'] === 'Event') out.push(n);
          else stack.push(...Object.values(n));
        }
      }
    } catch { /* пропуск */ }
  }
  let missing = 0;
  const samples = [];
  for (const ev of out) {
    const w = ev.url || `https://cyprus.bz/events/${slug}`;
    const k = `${String(ev.name || '').trim()}|${String(ev.startDate || '').slice(0, 10)}`;
    if (!dbSite.has(w) && !dbKey.has(k)) {
      missing++;
      if (samples.length < 6) samples.push(`${String(ev.name).slice(0, 45)} | ${k.split('|')[1]} | ${ev.location?.address?.addressLocality || '—'}`);
    }
  }
  console.log(`  ${slug}: страница ${html.length} б, событий в JSON-LD ${out.length}, НЕ в базе ${missing}`);
  for (const s of samples) console.log(`     + ${s}`);
}
