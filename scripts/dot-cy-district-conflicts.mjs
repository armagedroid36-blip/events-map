// Сверка ОКРУГА метки city с ОКРУГОМ точки: только истинные конфликты (city в другом округе).
// Попутно — карточки вне полигонов (координата в море/на севере).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, cityForPoint } from './cy-districts.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,start_date,city,address,lat,lng,website,title,source_type');

// город -> округ
const CITY_DISTRICT = {
  'лимасол': 'Лимасол', 'никосия': 'Никосия', 'ларнака': 'Ларнака', 'пафос': 'Пафос', 'фамагуста': 'Фамагуста',
  'ая-напа': 'Фамагуста', 'протарас': 'Фамагуста', 'паралимни': 'Фамагуста', 'полис': 'Пафос', 'лернака': 'Ларнака',
};
const norm = (c) => (c || '').replace(/,\s*кипр/i, '').trim().toLowerCase();

const cy = rows.filter((r) => r.status === 'active' && /кипр/i.test(r.city || '') && r.lat && r.lng);
const conflicts = [];
const outside = [];
for (const r of cy) {
  const d = districtOf(Number(r.lat), Number(r.lng));
  if (!d) { outside.push(r); continue; }
  const src = CITY_DISTRICT[norm(r.city)];
  if (src && src !== d) conflicts.push({ ...r, d, src });
}
console.log('active Кипра с координатами:', cy.length);
console.log('ИСТИННЫХ конфликтов округа (метка city vs точка):', conflicts.length);
for (const c of conflicts) {
  console.log('---', c.id.slice(0, 8), '| city=', c.city, '(', c.src, ') -> округ точки', c.d,
    '|', Number(c.lat).toFixed(4) + ',' + Number(c.lng).toFixed(4), '|', c.start_date);
  console.log('    venue:', c.place || '—', '| addr:', c.address || '—', '| site:', c.website || '—');
  console.log('    title:', (c.title || '').slice(0, 70), '| src:', c.source_type || '—');
}
console.log('вне полигонов:', outside.length, outside.map((r) => r.id.slice(0, 8) + ' ' + r.city + ' ' + Number(r.lat).toFixed(4) + ',' + Number(r.lng).toFixed(4)).join(' | '));
