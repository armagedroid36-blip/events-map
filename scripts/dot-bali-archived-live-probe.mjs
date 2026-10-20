// Зонд: архивные карточки Балифорума, у которых запись источника ВСЁ ЕЩЁ даёт будущие даты.
// Причина класса: у записи нет recurrence, карточка получает start_date первой даты,
// и archive-past.mjs архивирует её, хотя событие продолжается (еженедельные клубы, курсы, выставки).
// Норма 0. Печатает id/даты/шаг, чтобы ремонт шёл по данным источника, а не по догадке.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const API = 'https://baliforum.ru/api/v1/events';
const PAGES = Number(process.env.PAGES || 8);
const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';

async function get(url) {
  for (const u of [url + (url.includes('?') ? '&' : ''), '']) {
    try {
      const r = await fetch(u || url, PROXY && !u ? { dispatcher: undefined } : undefined);
      if (r.ok) return await r.json();
    } catch { /* пробуем следующий маршрут */ }
  }
  return null;
}

async function curlJson(target) {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('curl', ['-s', '--max-time', '20', '-x', PROXY, target], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(String(out));
}

const feed = new Map();
for (let p = 1; p <= PAGES; p++) {
  let j = null;
  try { j = await curlJson(`${API}?defaultList=1&page=${p}`); } catch (e) { console.log('страница', p, 'ошибка:', e.message); break; }
  const data = j?.data || [];
  if (!data.length) break;
  for (const e of data) if (!feed.has(e.slug)) feed.set(e.slug, e);
}
console.log('слагов в ленте:', feed.size);

const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,website,title,start_date,end_date,recurrence,city', {});
const byWeb = new Map();
for (const r of rows) if (r.website) byWeb.set(String(r.website).replace(/\/$/, ''), r);

const found = [];
for (const e of feed.values()) {
  const r = byWeb.get(`https://baliforum.ru/events/${e.slug}`);
  if (!r || r.status !== 'archived') continue;
  const fut = (e.eventDates || []).map(d => String(d.startAt || '').slice(0, 10)).filter(d => d >= today).sort();
  if (!fut.length) continue;
  const steps = new Set();
  for (let i = 1; i < fut.length; i++) steps.add(Math.round((Date.parse(fut[i]) - Date.parse(fut[i - 1])) / 86400000));
  found.push({ id: r.id, title: String(r.title || '').slice(0, 45), city: r.city, start: r.start_date, fut, step: [...steps].join('/'), rec: !!r.recurrence });
}
found.sort((a, b) => b.fut.length - a.fut.length);
console.log(`АРХИВНЫХ карточек, у которых источник даёт будущие даты: ${found.length}`);
for (const f of found) console.log(`  ${f.id} ${f.start} | n=${f.fut.length} шаг ${f.step} | ${f.city} | ${f.title} | след ${f.fut.slice(0, 3).join(',')}`);
console.log(found.length ? 'ДЕФЕКТ: карточки потеряны для карты' : 'норма: 0');
