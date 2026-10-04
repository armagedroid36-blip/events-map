// Добор фото для active-карточек без фото: берём og:image / twitter:image / JSON-LD image
// со страницы источника (website карточки). Проверенные данные со страницы источника.
// Запуск: node --env-file=.env scripts/dot-photos-fill.mjs            (сухой прогон)
//         APPLY=1 node --env-file=.env scripts/dot-photos-fill.mjs    (записать)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const BUDGET_MS = Number(process.env.BUDGET_MS || 90000);
const t0 = Date.now();
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const rows = await selectAll(db, 'events', 'id,status,title,city,start_date,photos,website,source_type');
const targets = rows.filter(
  (r) => r.status === 'active' && !(r.photos || []).length && /^https?:/.test(r.website || ''),
);
console.log('карточек active без фото:', targets.length, '| режим:', APPLY ? 'APPLY' : 'dry');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function grab(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html' } });
    if (!res.ok) return { err: 'HTTP ' + res.status };
    const html = await res.text();
    const pick = (re) => {
      const m = html.match(re);
      return m ? m[1].trim() : null;
    };
    let img =
      pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
      pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!img) {
      const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of ld) {
        const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
        try {
          const data = JSON.parse(body);
          const list = Array.isArray(data) ? data : [data];
          for (const d of list) {
            const im = d && d.image;
            const cand = Array.isArray(im) ? im[0] : typeof im === 'object' && im ? im.url : im;
            if (typeof cand === 'string' && cand.startsWith('http')) {
              img = cand;
              break;
            }
          }
        } catch {
          /* невалидный JSON-LD — пропускаем */
        }
        if (img) break;
      }
    }
    if (img && /og-default|placeholder|default\.(png|jpg|jpeg|webp)|\/logo|sprite/i.test(img)) img = null; // заглушки сайта — не фото события
    return { img, len: html.length };
  } catch (e) {
    return { err: String(e.message || e).slice(0, 60) };
  } finally {
    clearTimeout(timer);
  }
}

let found = 0;
let written = 0;
const plan = [];
for (const r of targets) {
  if (Date.now() - t0 > BUDGET_MS) {
    console.log('бюджет времени исчерпан, осталось', targets.length - plan.length, 'карточек');
    break;
  }
  const out = await grab(r.website);
  if (out.img) {
    found++;
    plan.push({ id: r.id, img: out.img });
    console.log('  +', r.id.slice(0, 8), r.city, out.img.slice(0, 90));
  } else {
    console.log('  -', r.id.slice(0, 8), r.city, out.err || 'нет og:image', `(${out.len} байт)`);
  }
}

if (APPLY) {
  for (const p of plan) {
    const { error } = await db.from('events').update({ photos: [p.img] }).eq('id', p.id).select('id');
    if (error) console.log('  ошибка записи', p.id.slice(0, 8), error.message);
    else written++;
  }
  console.log('записано:', written);
}
console.log('итог: найдено фото', found, 'из', targets.length, '| время', ((Date.now() - t0) / 1000).toFixed(1) + 'с');
