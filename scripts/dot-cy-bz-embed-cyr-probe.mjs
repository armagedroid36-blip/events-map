// Зонд: карточки, отклонённые аудитом embed по причине «нет имени площадки на странице»,
// у которых адрес записан ПО-РУССКИ, а страница cyprus.bz — латиница/греческий.
// Задача зонда — показать, что реально лежит в странице (iframe embed + ближайший текст),
// чтобы решить, ложный ли это отказ.
// Запуск: node --env-file=.env scripts/dot-cy-bz-embed-cyr-probe.mjs
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const PROXY = 'http://127.0.0.1:10809';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const IDS = (process.env.IDS || '9010635a,b5e59d3f,bbac87f6,d41899dd,dd1d7523').split(',').map((s) => s.trim()).filter(Boolean);

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = (s) => s.toLowerCase().split('').map((ch) => TR[ch] ?? ch).join('');

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website');

for (const id8 of IDS) {
  const r = rows.find((x) => x.id.startsWith(id8));
  if (!r) { console.log(`${id8}: карточка не найдена`); continue; }
  const page = String(r.website || '').replace(/cyprus\.bz\/(?:ru|en)\/event\//i, 'cyprus.bz/event/');
  let html = '';
  try { html = execFileSync('curl', ['-s', '-L', '-m', '25', '--proxy', PROXY, page], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8'); } catch { html = ''; }
  console.log(`\n=== ${id8} «${r.title_ru || r.title}» | city=${r.city} | addr=${r.address} | ${r.status} | ${r.start_date}`);
  console.log(`page: ${page} | html ${html.length} Б`);
  const m = html.match(/maps\/embed\/v1\/place[^"']*q=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
  console.log(`embed: ${m ? m[1] + ',' + m[2] : 'НЕТ'}`);
  const iframes = html.match(/maps\/embed\/v1\/place[^"']{0,200}/g) || [];
  for (const f of iframes) console.log(`  iframe: ${f.slice(0, 200)}`);
  const flat = html.replace(/\s+/g, ' ');
  const words = ((r.address || '').match(/[a-zа-яё]{4,}/gi) || []).map((w) => w.toLowerCase())
    .filter((w) => !['отель', 'hotel', 'resort', 'park', 'парк', 'hall', 'bar', 'клуб', 'club'].includes(w));
  for (const w of words) {
    const t = translit(w);
    const idx = flat.toLowerCase().indexOf(t);
    if (idx >= 0) console.log(`  «${w}» -> ${t}: НАЙДЕНО «…${flat.slice(Math.max(0, idx - 60), idx + 60)}…»`);
    else console.log(`  «${w}» -> ${t}: не найдено`);
  }
  const titleWords = ((r.title_ru || r.title || '').match(/[a-zа-яё]{4,}/gi) || []).map((w) => w.toLowerCase()).slice(0, 4);
  for (const w of titleWords) {
    const t = translit(w);
    if (flat.toLowerCase().includes(t)) console.log(`  [title] «${w}» -> ${t}: есть`);
  }
}
