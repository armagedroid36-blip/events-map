// Перезаливка протухших фото Telegram (cdn*.telesco.pe) в свой Storage.
// Свежие подписанные ссылки берём с embed-страницы поста t.me (через прокси 10809),
// скачиваем, заливаем в бакет photos и пишем публичные URL в карточку.
// DRY по умолчанию; APPLY=1 пишет. LIMIT — сколько карточек за прогон.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const execFileP = promisify(execFile);
const PROXY = 'http://127.0.0.1:10809';
const APPLY = process.env.APPLY === '1';
const LIMIT = Number(process.env.LIMIT || 5);
const TMP = process.env.LOCALAPPDATA + '/Temp';
const MIN_BYTES = Number(process.env.MIN_BYTES || 15000);

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

async function fetchTo(url, out) {
  const { stdout } = await execFileP('curl', [
    '-s', '--max-time', '25', '-x', PROXY, '-A', 'Mozilla/5.0', url, '-o', out, '-w', '%{http_code}',
  ], { maxBuffer: 1e7 });
  return Number(String(stdout).trim());
}

const IDS = (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const rows = await selectAll(db, 'events', 'id,status,title,photos,website');
const targets = rows
  .filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status)
    && (IDS.length ? IDS.includes(r.id) : (r.photos || []).some((u) => /telesco\.pe/.test(u)))
    && /^https?:\/\/t\.me\//.test(r.website || ''))
  .slice(0, IDS.length || LIMIT);

console.log('кандидатов к перезаливке:', targets.length, '| режим:', APPLY ? 'APPLY' : 'dry');
let done = 0;
let fail = 0;

for (const r of targets) {
  const m = (r.website || '').match(/t\.me\/([^/]+)\/(\d+)/);
  if (!m) { console.log('пропуск (нет id поста):', r.id); fail++; continue; }
  const [, ch, mid] = m;
  const htmlPath = `${TMP}/p304_${ch}_${mid}.html`;
  let code = 0;
  try { code = await fetchTo(`https://t.me/${ch}/${mid}?embed=1&mode=tme`, htmlPath); } catch { code = 0; }
  if (code !== 200) { console.log('FAIL embed', ch, mid, code); fail++; continue; }

  const html = await fs.readFile(htmlPath, 'utf8');
  const uniq = [...new Set([...html.matchAll(/https:\/\/cdn[0-9]*\.telesco\.pe\/file\/[^"')\\ ]+/g)].map((x) => x[0]))]
    .filter((u) => !/emoji/.test(u));

  const got = [];
  for (let i = 0; i < Math.min(uniq.length, 4); i++) {
    const img = `${TMP}/p304_${ch}_${mid}_${i}.bin`;
    let ic = 0;
    try { ic = await fetchTo(uniq[i], img); } catch { ic = 0; }
    const size = ic === 200 ? (await fs.stat(img)).size : 0;
    if (ic !== 200 || size < MIN_BYTES) { console.log('  пропуск фото', i, ic, size); continue; }
    got.push({ i, size, img });
  }
  got.sort((a, b) => b.size - a.size);

  const saved = [];
  for (let k = 0; k < Math.min(got.length, 3); k++) {
    const { img, size } = got[k];
    if (!APPLY) { saved.push(`dry:${size}b`); continue; }
    const buf = await fs.readFile(img);
    const path = `tg/${ch}/${mid}-${k}.jpg`;
    const { error } = await db.storage.from('photos').upload(path, buf, {
      contentType: 'image/jpeg', upsert: true, cacheControl: '86400',
    });
    if (error) { console.log('  upload error', error.message); continue; }
    saved.push(db.storage.from('photos').getPublicUrl(path).data.publicUrl);
  }
  if (!saved.length) { console.log('FAIL ни одного фото', ch, mid); fail++; continue; }

  console.log(APPLY ? 'OK' : 'dry OK', r.id.slice(0, 8), ch, mid, 'фото:', saved.length);
  if (APPLY) {
    const { error } = await db.from('events').update({ photos: saved }).eq('id', r.id);
    if (error) { console.log('  update error', error.message); fail++; continue; }
  }
  done++;
}
console.log('итог:', APPLY ? 'обновлено' : 'готово к записи', done, '| ошибок', fail);
