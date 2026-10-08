// dot-cy-wheat-dupe-archive.mjs — разовый ремонт класса «источник слил две страницы
// cyprus.bz в одну»: живая карточка со «старым» URL отдаёт 301 на каноническую страницу,
// при этом в базе лежат ОБЕ карточки → одно событие на карте двумя метками.
// Проверка класса (08.10.2026, run 104): из 58 живых cyprus.bz-карточек в группах
// (дата|город) 11 страниц отдают 301; у 5 из них канонический двойник в базе тоже live.
// Архив — не удаление (штатный dedupe-events.mjs делает то же), строка остаётся в базе.
// DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// id-префикс -> страховки (карточка активна и в ней ровно эти данные) + какая карточка остаётся
const TARGETS = {
  '57c33588': {
    title: 'Wheat Harvest Festival', start_date: '2026-10-09', city: 'Фамагуста, Кипр',
    website: 'https://cyprus.bz/event/36cb/wheat-harvest-festival-2026-1', keep: 'e2129973',
    why: '36cb → 301 → /event/349f (одно и то же событие в Ахериту)',
  },
  '07ea07d3': {
    title: 'SBPC. Concert', start_date: '2026-11-21', city: 'Лимасол, Кипр',
    website: 'https://cyprus.bz/event/345e/sbpc-concert-2026', keep: '4f513d0f',
    why: '345e → 301 → /event/2e6a (Opus Events Venue, 21.11 20:00 — совпадает у обеих карточек)',
  },
  '1a9c7d0a': {
    title: 'Symphonic Anime Show', start_date: '2027-01-22', city: 'Лимасол, Кипр',
    website: 'https://cyprus.bz/event/35ba/symphonic-anime-show-2027', keep: 'e2f0b0e2',
    why: '35ba → 301 → /event/3139 (Monte Caputo, 22.01.27 19:30 — совпадает)',
  },
  '187e8ee3': {
    title: 'A concert of classical Viennese music', start_date: '2026-11-21', city: 'Пафос, Кипр',
    website: 'https://cyprus.bz/event/3506/a-concert-of-classical-viennese-music-2026', keep: 'b80afec6',
    why: '3506 → 301 → /event/32fb (Markideio Theatre, 21.11 20:30 — совпадает)',
  },
  '9fcfa914': {
    title: 'Thrash Metal at Monte Caputo', start_date: '2026-11-22', city: 'Лимасол, Кипр',
    website: 'https://cyprus.bz/event/3544/thrash-metal-at-monte-caputo-2026', keep: '413d88a7',
    why: '3544 → 301 → /event/3127 (Monte Caputo, 22.11; у канонической карточки время 18:30, у этой 00:00)',
  },
  '5ffe95c8': {
    title: 'The One Shoe', start_date: '2026-11-08', city: 'Никосия, Кипр',
    website: 'https://cyprus.bz/event/35ac/the-one-shoe-2026', keep: 'e01fbad6',
    why: '35ac → 301 → /event/322d (08.11 10:30; у канонической карточки пин площадки, у этой центр Никосии)',
  },
};

const rows = await selectAll(db, 'events', 'id,title,start_date,city,website,status,lat,lng');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));

let applied = 0, skipped = 0;
for (const [prefix, t] of Object.entries(TARGETS)) {
  const r = byId.get(prefix);
  if (!r) { console.log(`ПРОПУСК ${prefix}: карточки нет в базе`); skipped++; continue; }
  console.log(`${prefix} | ${r.status} | ${r.title} | ${r.start_date} | ${r.city} | ${r.lat},${r.lng}`);
  if (r.status !== 'active') { console.log(`   -> пропуск: статус ${r.status}`); skipped++; continue; }
  if (r.title !== t.title || r.start_date !== t.start_date || r.city !== t.city || r.website !== t.website) {
    console.log(`   -> пропуск: данные не совпадают с ожидаемыми`); skipped++; continue;
  }
  const keep = byId.get(t.keep);
  if (!keep || keep.status !== 'active') { console.log(`   -> пропуск: карточка-двойник ${t.keep} не active`); skipped++; continue; }
  console.log(`   одно событие двумя карточками: оставляю ${t.keep} (${keep.title} | ${keep.lat},${keep.lng}), архивирую ${prefix}`);
  console.log(`   ${t.why}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', r.id).select('id,status');
  if (error || !data?.length || data[0].status !== 'archived') { console.log(`   ОШИБКА записи: ${error?.message || JSON.stringify(data)}`); skipped++; continue; }
  applied++;
  console.log(`   записано: ${data[0].status}`);
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
