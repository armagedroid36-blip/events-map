// Пакетный пин кипрских карточек по групповым площадкам: координата берётся из
// iframe Google Maps страницы cyprus.bz (maps/embed/v1/place?...&q=<lat>%2C<lng>).
// Запуск: DRY=1 node scripts/dot-cy-bz-embed-venue-fix.mjs   (по умолчанию DRY)
//         APPLY=1 node scripts/dot-cy-bz-embed-venue-fix.mjs
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const PROXY = 'http://127.0.0.1:10809';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// площадка -> страница-источник, псевдонимы в адресе карточки, карточки
const VENUES = [
  { venue: 'Pattichio Theatre', page: 'https://cyprus.bz/event/3157/gennady-khazanov-i-am-overgrown-with-memory-2026', al: ['pattichio', 'παττίχειο'], ids: ['173747cd', '3594699b', '5749fce0'] },
  { venue: 'Savino Live', page: 'https://cyprus.bz/event/35c0/halloween-special-party-at-savino-live-2026', al: ['savino', 'савино'], ids: ['309cb57d', '3d63a21a', '6d3d89e8'] },
  { venue: 'Ypsonas Municipal Theatre', page: 'https://cyprus.bz/event/341e/italian-passions-with-a-cypriot-accent-2026', al: ['ypsonas', 'ипсонас'], ids: ['16b568c5', '7225a82a'] },
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
  if (!html) { errors++; continue; }
  const m = html.match(/maps\/embed\/v1\/place[^"]*q=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
  if (!m) { console.log(`${v.venue}: координат в iframe нет`); errors++; continue; }
  const lat = Number(m[1]), lng = Number(m[2]);
  console.log(`${v.venue}: источник даёт ${lat},${lng}`);
  for (const id of v.ids) {
    const r = rows.find((x) => x.id.startsWith(id));
    if (!r) { console.log(`  ${id}: карточка не найдена`); errors++; continue; }
    const addr = (r.address || '').toLowerCase();
    const ok = v.al.some((a) => addr.includes(a));
    const dist = Math.hypot((r.lat - lat) * 111, (r.lng - lng) * 88);
    console.log(`  ${id} ${r.status} «${(r.title || '').slice(0, 38)}» | ${r.lat},${r.lng} -> ${lat},${lng} (${(dist * 1000).toFixed(0)} м) адрес~площадка: ${ok}`);
    if (!ok) { console.log('    пропуск: в адресе карточки нет имени площадки'); errors++; continue; }
    if (dist < 0.05) { console.log('    уже на месте'); continue; }
    if (!APPLY) { console.log('    [DRY] записал бы координаты'); continue; }
    const { data, error } = await db.from('events').update({ lat, lng }).eq('id', r.id).select('id');
    if (error || !data?.length) { console.log('    ОШИБКА:', error?.message || 'обновлено 0 строк'); errors++; }
    else { console.log('    записано'); applied++; }
  }
}
console.log(`\nГотово: применено ${applied}, ошибок/пропусков ${errors}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
