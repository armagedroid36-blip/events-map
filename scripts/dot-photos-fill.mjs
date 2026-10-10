// Добор фото для active-карточек без фото: берём og:image / twitter:image / JSON-LD image
// со страницы источника (website карточки). Проверенные данные со страницы источника.
// Запуск: node --env-file=.env scripts/dot-photos-fill.mjs            (сухой прогон)
//         APPLY=1 node --env-file=.env scripts/dot-photos-fill.mjs    (записать)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Часть страниц источников недоступна с RU-IP (cyprusnow/cyprus.bz отдают aborted,
// t.me режется) — читаем их через локальный прокси 10809 тем же curl, что и зонды.
const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';
const execFileP = promisify(execFile);

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

// Индекс «URL фото → название события-владельца»: одна картинка не должна уезжать
// в разные события (признак картинки страницы-списка/афиши зала, а не фото события).
const toks = (t) =>
  String(t || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));
const sameEvent = (a, b) => {
  const A = toks(a).slice(0, 3).join(' ');
  const B = toks(b).slice(0, 3).join(' ');
  return A && B && A === B;
};
const usedFoto = new Map();
for (const r of rows) for (const u of r.photos || []) if (!usedFoto.has(u)) usedFoto.set(u, r);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

function parseImg(html) {
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
  if (img && /og-default|placeholder|default\.(png|jpg|jpeg|webp)|\/logo|sprite|opengraph-image/i.test(img)) img = null; // заглушки сайта (в т.ч. генератор OG-карточек cyprusnow) — не фото события
  return img;
}

async function viaProxy(url) {
  try {
    const { stdout } = await execFileP('curl', ['-s', '-L', '--max-time', '25', '-x', PROXY, '-A', UA, url], {
      maxBuffer: 24 * 1024 * 1024,
      encoding: 'utf8',
    });
    return stdout || '';
  } catch (e) {
    return '';
  }
}

async function grab(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html' } });
    if (res.ok) {
      const html = await res.text();
      const img = parseImg(html);
      if (img) return { img, len: html.length, via: 'direct' };
      return { img: null, len: html.length };
    }
    return { img: null, err: 'HTTP ' + res.status };
  } catch (e) {
    const html = await viaProxy(url);
    if (html) {
      const img = parseImg(html);
      return { img, len: html.length, via: 'proxy', err: img ? null : 'нет og:image (proxy)' };
    }
    return { img: null, err: String(e.message || e).slice(0, 60) + ' / proxy пусто' };
  } finally {
    clearTimeout(timer);
  }
}

async function checkImage(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return 0;
    return (await res.arrayBuffer()).byteLength;
  } catch {
    try {
      const { stdout } = await execFileP(
        'curl',
        ['-s', '-L', '--max-time', '20', '-x', PROXY, '-o', 'NUL', '-w', '%{size_download}', '-A', UA, url],
        { encoding: 'utf8' },
      );
      return Number(String(stdout).trim()) || 0;
    } catch {
      return 0;
    }
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
    const owner = usedFoto.get(out.img);
    if (owner && !sameEvent(owner.title, r.title)) {
      console.log('  -', r.id.slice(0, 8), r.city, 'картинка уже у другого события:', owner.title.slice(0, 40));
      continue;
    }
    const size = await checkImage(out.img);
    if (size <= 1000) {
      console.log('  -', r.id.slice(0, 8), r.city, 'файл картинки не отдаётся/пустой (' + size + ' б) — не пишем');
      continue;
    }
    found++;
    plan.push({ id: r.id, img: out.img });
    usedFoto.set(out.img, r);
    console.log('  +', r.id.slice(0, 8), r.city, out.img.slice(0, 90), `[${out.via || 'direct'}, ${(size / 1024).toFixed(0)}КБ]`);
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
