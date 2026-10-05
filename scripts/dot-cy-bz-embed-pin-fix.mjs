// Пин кипрских карточек cyprus.bz по координате площадки из iframe Google Maps страницы источника.
// Запуск: DRY=1 node scripts/dot-cy-bz-embed-pin-fix.mjs   (по умолчанию DRY)
//         APPLY=1 node scripts/dot-cy-bz-embed-pin-fix.mjs
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const PROXY = 'http://127.0.0.1:10809';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// площадка -> страница-источник + карточки, которые должны стоять на ней
const VENUES = [
  { venue: 'Mason Bar', page: 'https://cyprus.bz/event/330c/coterie-w-argia-innervisions-2026', ids: ['e8f73e38', 'f2b8248d'] },
  { venue: 'Ypsonas Municipal Theatre', page: 'https://cyprus.bz/event/344b/the-night-before-christmas-nikolai-gogol-', ids: ['bfd43691', 'ebef1c5b'] },
];

const rows = await selectAll(db, 'events', 'id,title,address,city,lat,lng,status,website');

function fetchPage(url) {
  try {
    return execFileSync('curl', ['-s', '-L', '-m', '25', '--proxy', PROXY, url], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8');
  } catch (e) {
    console.log('  ! страница не скачалась:', e.message.slice(0, 80));
    return '';
  }
}

let applied = 0, errors = 0;
for (const v of VENUES) {
  const html = fetchPage(v.page);
  if (!html) continue;
  const m = html.match(/maps\/embed\/v1\/place[^"]*q=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
  const venueOnPage = html.includes(v.venue);
  if (!m) { console.log(`${v.venue}: координат в iframe нет`); errors++; continue; }
  const lat = Number(m[1]), lng = Number(m[2]);
  console.log(`${v.venue}: источник даёт ${lat},${lng} (площадка на странице: ${venueOnPage ? 'да' : 'НЕТ'})`);
  if (!venueOnPage) { errors++; continue; }
  for (const id of v.ids) {
    const r = rows.find((x) => x.id.startsWith(id));
    if (!r) { console.log(`  ${id}: карточка не найдена`); errors++; continue; }
    const sameAddr = (r.address || '').toLowerCase().includes(v.venue.toLowerCase().slice(0, 10));
    const dist = Math.hypot((r.lat - lat) * 111, (r.lng - lng) * 88);
    console.log(`  ${id} ${r.status} «${r.title.slice(0, 40)}» | ${r.lat},${r.lng} -> ${lat},${lng} (${(dist * 1000).toFixed(0)} м) адрес~площадка: ${sameAddr}`);
    if (!sameAddr) { console.log('    пропуск: в адресе карточки нет имени площадки'); errors++; continue; }
    if (dist < 0.05) { console.log('    уже на месте'); continue; }
    if (!APPLY) { console.log('    [DRY] записал бы координаты'); continue; }
    const { data, error } = await db.from('events').update({ lat, lng }).eq('id', r.id).select('id');
    if (error || !data?.length) { console.log('    ОШИБКА:', error?.message || 'обновлено 0 строк'); errors++; }
    else { console.log('    записано'); applied++; }
  }
}
console.log(`\nГотово: применено ${applied}, ошибок/пропусков ${errors}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
