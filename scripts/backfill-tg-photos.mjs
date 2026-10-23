#!/usr/bin/env node
/**
 * Бэкфилл мёртвых фото Telegram-карточек.
 *
 * У части карточек photos содержат ссылки на временный CDN t.me (cdn*.telesco.pe),
 * которые со временем отдают 404. Страница поста `t.me/<канал>/<id>?embed=1` содержит
 * СВЕЖИЕ рабочие ссылки на те же картинки — их скачиваем, кладём в свой публичный
 * bucket `photos` (tg/<md5>.<ext>) и подменяем URL в карточке.
 *
 * Запуск (из корня репозитория, через прокси — t.me с RU-IP режется):
 *   PROXY=http://127.0.0.1:10809 APPLY=1 LIMIT=25 node --env-file=.env scripts/backfill-tg-photos.mjs
 *
 * Без APPLY=1 — только отчёт (сколько карточек, что нашлось на страницах).
 * Защита: бюджет времени (MAX_MINUTES, по умолчанию 2.5), только status='active',
 * обновление с .select() и сверкой, что в photos не осталось telesco-ссылок у обновлённых.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const URL_BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const PROXY = process.env.PROXY || '';
const APPLY = process.env.APPLY === '1';
const LIMIT = Number(process.env.LIMIT || 25);
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 2.5);
const BUCKET = 'photos';
const MAX_BYTES = 5 * 1024 * 1024;
const started = Date.now();
const outOfTime = () => Date.now() - started > MAX_MINUTES * 60 * 1000;

if (!URL_BASE || !KEY) {
  console.error('нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE (запуск с --env-file=.env)');
  process.exit(1);
}
const db = createClient(URL_BASE, KEY);
const tmp = mkdtempSync(join(tmpdir(), 'tg-photo-'));

const proxyArgs = PROXY ? ['-x', PROXY] : [];
function curlText(url, maxTime = 20) {
  try {
    return execFileSync('curl', ['-s', '-L', ...proxyArgs, '-A', 'Mozilla/5.0', '--max-time', String(maxTime), url], {
      encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}
function curlFile(url, dest) {
  try {
    execFileSync('curl', ['-s', '-L', ...proxyArgs, '-A', 'Mozilla/5.0', '--max-time', '20', '-o', dest, url], { maxBuffer: 1024 * 1024 });
    return readFileSync(dest);
  } catch {
    return null;
  }
}

const asArray = (p) => {
  if (!p) return [];
  if (Array.isArray(p)) return p.filter((x) => typeof x === 'string' && x);
  if (typeof p === 'string') {
    try { const j = JSON.parse(p); return Array.isArray(j) ? j.filter((x) => typeof x === 'string' && x) : [p]; } catch { return [p]; }
  }
  if (typeof p === 'object') return Object.values(p).filter((x) => typeof x === 'string' && x);
  return [];
};
const isTgCdn = (u) => /telesco\.pe/i.test(u);

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const mimeByExt = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const magic = (buf) => {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
};

async function upload(buf, mime) {
  const ext = EXT[mime];
  if (!ext) return null;
  const path = `tg/${createHash('md5').update(buf).digest('hex')}.${ext}`;
  const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': mime, 'x-upsert': 'true' },
    body: buf,
  });
  if (!up.ok) {
    console.warn(`  [фото] заливка не удалась: ${up.status}`);
    return null;
  }
  return `${URL_BASE}/storage/v1/object/public/${BUCKET}/${path}`;
}

const rows = await selectAll(db, 'events', 'id,title,website,photos,status', { filter: (q) => q.eq('status', 'active') });
const targets = rows.filter((r) => asArray(r.photos).some(isTgCdn));
console.log(`активных ${rows.length}, карточек с telesco-фото ${targets.length}, к обработке ${Math.min(LIMIT, targets.length)}${APPLY ? '' : ' (DRY)'}`);

let fixedCards = 0, fixedUrls = 0, skipped = 0, updatedCards = 0;
for (const row of targets) {
  if (outOfTime()) { console.log('  [бюджет времени исчерпан]'); break; }
  if (fixedCards >= LIMIT) break;
  const photos = asArray(row.photos);
  const failedIdx = photos.map((u, i) => (isTgCdn(u) ? i : -1)).filter((i) => i >= 0);
  const m = String(row.website || '').match(/t\.me\/([A-Za-z0-9_]+)\/(\d+)/);
  if (!m) { skipped++; console.log(`SKIP ${row.id.slice(0, 8)} нет ссылки на пост t.me`); continue; }
  const embedUrl = `https://t.me/${m[1]}/${m[2]}?embed=1`;
  const html = curlText(embedUrl);
  if (!html) { skipped++; console.log(`SKIP ${row.id.slice(0, 8)} пост не отдался (${m[1]}/${m[2]})`); continue; }
  const fresh = [];
  for (const mm of html.matchAll(/https:\/\/cdn\d*\.telesco\.pe\/file\/[A-Za-z0-9_\-.]+\.(?:jpe?g|png|webp)/g)) {
    const u = mm[0];
    if (!fresh.includes(u)) fresh.push(u);
  }
  if (!fresh.length) { skipped++; console.log(`SKIP ${row.id.slice(0, 8)} на странице поста telesco-картинок нет`); continue; }

  const next = photos.slice();
  let replaced = 0;
  for (let k = 0; k < failedIdx.length; k++) {
    const src = fresh[k];
    if (!src) break;
    if (!APPLY) { replaced++; continue; }
    const tmpFile = join(tmp, `${createHash('md5').update(src).digest('hex')}.bin`);
    const buf = curlFile(src, tmpFile);
    if (!buf || !buf.length || buf.length > MAX_BYTES) continue;
    const mime = magic(buf) || mimeByExt[(src.split('.').pop() || '').toLowerCase()];
    if (!mime) continue;
    const pub = await upload(buf, mime);
    if (!pub) continue;
    next[failedIdx[k]] = pub;
    replaced++;
  }
  if (!replaced) { skipped++; console.log(`SKIP ${row.id.slice(0, 8)} нечего заменить (свежих файлов 0)`); continue; }
  fixedUrls += replaced;
  if (APPLY) {
    const { data, error } = await db.from('events').update({ photos: next }).eq('id', row.id).eq('status', 'active').select('id,title,photos,status,city,start_date');
    if (error || !data?.length) { console.warn(`  [фото] карточка ${row.id.slice(0, 8)} не обновилась: ${error?.message || 'нет строк'}`); continue; }
    const left = asArray(data[0].photos).filter(isTgCdn).length;
    if (left) { console.warn(`  [фото] в ${row.id.slice(0, 8)} осталось telesco: ${left}`); continue; }
    updatedCards++;
    console.log(`OK ${row.id.slice(0, 8)} | ${(row.title || '').slice(0, 40)} | заменено ${replaced} | ${data[0].status} ${data[0].city} ${data[0].start_date}`);
  } else {
    console.log(`DRY ${row.id.slice(0, 8)} | ${(row.title || '').slice(0, 40)} | под замену ${replaced} | свежих на странице ${fresh.length}`);
  }
  fixedCards++;
}

console.log(`Готово: карточек обработано ${fixedCards}, заменено URL ${fixedUrls}, обновлено в базе ${updatedCards}, пропущено ${skipped}, ${((Date.now() - started) / 1000).toFixed(1)} с${APPLY ? '' : ' (DRY, база не менялась)'}`);
