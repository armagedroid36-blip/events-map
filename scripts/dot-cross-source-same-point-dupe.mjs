// Класс «одно событие собрано ДВАЖДЫ из двух источников» (cyprusnow.app ↔ cyprus.bz):
// живая карточка-двойник на карте (две метки на одном месте, дубль в списке).
// Признак тройного согласия: ОДНА дата + ОДНО время начала + точки в пределах 200 м
// + разные хосты источников (cyprusnow.app / cyprus.bz) + хотя бы одно общее
// содержательное слово в названиях. Штатный дедуп такое не видит: ключ title|start_date
// расходится (RU-перевод ↔ EN-название, разные хвосты), liveDupeMatch требует равного адреса.
//
// Запуск:  node --env-file=.env scripts/dot-cross-source-same-point-dupe.mjs        (DRY)
//          APPLY=1 node --env-file=.env scripts/dot-cross-source-same-point-dupe.mjs (архив двойника)
//
// Что делает APPLY: у пары остаётся карточка лучшего качества (фото > описание > адрес,
// при равенстве — cyprus.bz, у неё своя страница события), вторая уходит в status='archived'.
// Ничего не удаляется; страховки: обе карточки active, дата/время/точка совпадают ещё раз
// перед update, ответ читается через .select().
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { STOP as KEY_STOP, FUNC, GENERIC, PLACE_STOP } from './live-dupe-key.mjs';

const APPLY = process.env.APPLY === '1';
const MAX_M = Number(process.env.MAX_M || 200);
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const COLS = 'id,title,title_ru,title_en,city,address,lat,lng,start_date,start_time,status,website,photos,description,source_type';
const all = await selectAll(db, 'events', COLS);
const live = all.filter((r) => r.status === 'active' && r.lat && r.lng && r.start_date && r.start_time);
console.log(`Строк в базе: ${all.length}; живых с точкой и временем: ${live.length}`);

const stop = new Set([...KEY_STOP, ...FUNC, ...GENERIC, ...PLACE_STOP]);
const words = (r) => {
  const s = [r.title, r.title_ru, r.title_en].filter(Boolean).join(' ');
  return new Set(String(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w)));
};
const host = (u) => {
  try { return new URL(String(u)).host.replace(/^www\./, ''); } catch { return ''; }
};
const SRC = new Set(['cyprusnow.app', 'cyprus.bz']);
const dist = (a, b) => {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const quality = (r) => {
  const photos = Array.isArray(r.photos) ? r.photos.length : 0;
  const d = String(r.description || '').length;
  const addr = String(r.address || '').length;
  const isBz = host(r.website) === 'cyprus.bz';
  return photos * 1000 + Math.min(d, 900) + (addr > 12 ? 50 : 0) + (isBz ? 20 : 0);
};

// группировка: дата + время (секунды отбрасываем) -> пары по близости
const groups = new Map();
for (const r of live) {
  if (!SRC.has(host(r.website))) continue;
  const k = `${r.start_date}|${String(r.start_time).slice(0, 5)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const pairs = [];
for (const [k, rows] of groups) {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (host(a.website) === host(b.website)) continue;
      const m = dist(a, b);
      if (m > MAX_M) continue;
      const shared = [...words(a)].filter((w) => words(b).has(w));
      if (!shared.length) continue;
      pairs.push({ k, a, b, m, shared });
    }
  }
}

console.log(`Пар «одна дата + одно время + одна точка (<${MAX_M} м) + общее слово»: ${pairs.length}`);
for (const p of pairs) {
  const keep = quality(p.a) >= quality(p.b) ? p.a : p.b;
  const drop = keep === p.a ? p.b : p.a;
  console.log(`  ${p.k} | ${p.m.toFixed(0)} м | общие: ${p.shared.join(',')}`);
  console.log(`    keep ${keep.id.slice(0, 8)} [${host(keep.website)}] ${keep.title} | ${keep.address || '—'}`);
  console.log(`    drop ${drop.id.slice(0, 8)} [${host(drop.website)}] ${drop.title} | ${drop.address || '—'}`);
}

if (!APPLY) {
  console.log('\nDRY: ничего не менял. APPLY=1 — архивировать двойников.');
  process.exit(0);
}

let done = 0, skipped = 0;
for (const p of pairs) {
  const keep = quality(p.a) >= quality(p.b) ? p.a : p.b;
  const drop = keep === p.a ? p.b : p.a;
  // страховка: перечитываем двойника перед update — он должен быть тем же active-событием
  const { data: cur, error: e0 } = await db.from('events').select(COLS).eq('id', drop.id).single();
  if (e0 || !cur || cur.status !== 'active' || cur.start_date !== drop.start_date
      || String(cur.start_time).slice(0, 5) !== String(drop.start_time).slice(0, 5)
      || Math.abs(cur.lat - drop.lat) > 0.001 || Math.abs(cur.lng - drop.lng) > 0.001) {
    console.log(`SKIP ${drop.id.slice(0, 8)}: состояние изменилось`);
    skipped++; continue;
  }
  const { data: upd, error } = await db.from('events').update({ status: 'archived' })
    .eq('id', drop.id).eq('status', 'active').select('id,status,start_date,city,website');
  if (error || !upd?.length || upd[0].status !== 'archived') {
    console.log(`FAIL ${drop.id.slice(0, 8)}: ${error?.message || 'no rows'}`);
    skipped++; continue;
  }
  console.log(`ARCH ${drop.id.slice(0, 8)} → archived (дубль ${keep.id.slice(0, 8)}, ${host(keep.website)})`);
  done++;
}
console.log(`\nГотово: архивировано ${done}, пропущено ${skipped}.`);
