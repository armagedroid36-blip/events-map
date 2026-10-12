// Юнит + живая проверка реестра «площадка -> город» (scripts/venue-city.mjs).
// Запуск: node scripts/dot-venue-city-registry-check.mjs
// С живой базой: node --env-file=.env scripts/dot-venue-city-registry-check.mjs
import { buildVenueCityRegistry, cityForVenue, venueKey } from './venue-city.mjs';

let ok = 0;
const bad = [];
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; console.log(`  OK  ${name}`); }
  else { bad.push(name); console.log(`  ПЛОХО ${name}: получено ${JSON.stringify(got)}, ожидалось ${JSON.stringify(want)}`); }
};

// Живые данные 12.10.2026 (после ремонта запуска 186)
const FYTI = { address: 'Fyti Village Square, Fyti', lat: 34.9287321, lng: 32.5437806 };
const CASTLE = { address: 'Castle Club, Ayia Napa', lat: 34.9898, lng: 33.998 };

const fytiRows = [1, 1, 1, 1, 1].map(() => ({ address: 'Fyti Village Square, Fyti, Paphos', lat: 34.9287321, lng: 32.5437806, city: 'Пафос, Кипр' }));
const castleRows = [
  ...Array(22).fill({ address: 'Castle Club, Ayia Napa', lat: 34.9898, lng: 33.998, city: 'Ая-Напа, Кипр' }),
  { address: 'Castle Club, Ayia Napa', lat: 34.9898, lng: 33.998, city: 'Фамагуста, Кипр' },
];

const reg = buildVenueCityRegistry([...fytiRows, ...castleRows]);
t('Fyti Village Square -> Пафос', cityForVenue(FYTI, reg, 'Пафос'), 'Пафос');
t('Castle Club -> Ая-Напа', cityForVenue(CASTLE, reg, 'Фамагуста'), 'Ая-Напа');
t('одна карточка у площадки — не арбитр', cityForVenue({ address: 'One-off Hall, Larnaca', lat: 34.9, lng: 33.6 }, buildVenueCityRegistry([{ address: 'One-off Hall, Larnaca', lat: 34.9, lng: 33.6, city: 'Ларнака, Кипр' }]), 'Ларнака'), null);
t('метка реестра против округа точки — отклоняем', cityForVenue({ address: 'X Hall, Larnaca', lat: 34.9287, lng: 32.5438 }, buildVenueCityRegistry([{ address: 'X Hall', lat: 34.9287, lng: 32.5438, city: 'Лимасол, Кипр' }, { address: 'X Hall', lat: 34.9287, lng: 32.5438, city: 'Лимасол, Кипр' }]), 'Пафос'), null);
t('без координат ключа нет', venueKey('Fyti Village Square', null, null), null);
t('пустой реестр — молчит', cityForVenue(FYTI, new Map(), 'Пафос'), null);

console.log(`\nЮнит: ${ok}/${ok + bad.length} OK`);

// Живой реестр (если есть ключи Supabase)
try {
  const { createClient } = await import('@supabase/supabase-js');
  const { selectAll } = await import('./db-rows.mjs');
  const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
  const rows = await selectAll(db, 'events', 'city, address, lat, lng, status', {
    filter: (q) => q.in('status', ['active', 'moderation', 'archived']),
    log: () => {},
  });
  const live = buildVenueCityRegistry(rows);
  console.log(`\nЖивой реестр: строк ${rows.length}, площадок ${live.size}`);
  for (const p of [FYTI, CASTLE]) {
    const k = venueKey(p.address, p.lat, p.lng);
    const e = live.get(k);
    console.log(`  ${p.address}: ключ ${k} -> ${e ? `«${e.city}» (${e.n} из ${e.total})` : 'нет в реестре'}`);
  }
  const многометные = [...live.entries()].filter(([, e]) => e.n < e.total).length;
  console.log(`  площадок с расхождением метки: ${многометные}`);
} catch (e) {
  console.log(`\nЖивой реестр пропущен: ${e.message}`);
}
process.exit(bad.length ? 1 : 0);
