// Точка «События»: ремонт координат-заглушек (центр города) у карточек, чей адрес
// называет другой населённый пункт. Координаты берутся у Nominatim (OSM) по названию
// местности из адреса источника. DRY по умолчанию, APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// id -> запрос к геокодеру (населённый пункт/место из адреса источника)
const TARGETS = {
  '22f4448c': 'Nikitari, Cyprus',
  '3845e750': 'Pano Lefkara, Cyprus',
  'b65ba6ea': 'Lefkara, Larnaca, Cyprus',
  'dbb4cbec': 'Omodos, Cyprus',
  'b2cc4009': 'Palaichori, Cyprus',
  '55f102fe': 'Palaichori, Cyprus',
  '4116c490': 'Coral Bay, Paphos, Cyprus',
  '137c58e9': 'Mesaorias, Limassol, Cyprus',
  '707055aa': 'Mesaorias, Limassol, Cyprus',
  'e37a0231': 'Mesaorias, Limassol, Cyprus',
  '38e9fe08': 'Promachon Eleftherias, Limassol, Cyprus',
};

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
for (const [pref, q] of Object.entries(TARGETS)) {
  const r = byId.get(pref);
  if (!r) { console.log(pref, 'нет карточки'); continue; }
  let res = null;
  for (let a = 0; a < 2 && !res; a++) {
    try {
      const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cy&q=' + encodeURIComponent(q);
      const resp = await fetch(u, { headers: { 'user-agent': 'events-map-dot/1.0 (armagedroid@yandex.ru)' }, signal: AbortSignal.timeout(15000) });
      const j = await resp.json();
      if (Array.isArray(j) && j[0]) res = j[0];
    } catch (e) { console.log(pref, 'ошибка геокодера', String(e).slice(0, 60)); }
    if (!res) await sleep(1500);
  }
  if (!res) { console.log(pref, 'геокодер пусто:', q); continue; }
  const lat = Number(res.lat), lng = Number(res.lon);
  const dOld = (Math.hypot((lat - r.lat) * 111, (lng - r.lng) * 92)).toFixed(1);
  console.log(`${pref} | ${r.city} | ${q} -> ${lat},${lng} (${res.display_name.slice(0, 60)}) | было ${r.lat},${r.lng} ~${dOld} км | ${(r.title_ru || r.title || '').slice(0, 40)}`);
  out.push({ id: r.id, lat, lng, dOld: Number(dOld) });
  await sleep(1200);
}

// Только проверенные сопоставления уровня населённого пункта.
// Отброшены: b65ba6ea (Nominatim дал ювелирный магазин, а не водохранилище),
// 137c58e9/707055aa/e37a0231 (сайт клуба: «в центре Лимасола», улица Mesaorias
// в Ипсоне — не тот адрес), 38e9fe08 (улица не подтверждена сайтом клуба).
const SKIP = new Set(['b65ba6ea', '137c58e9', '707055aa', 'e37a0231', '38e9fe08']);
const good = out.filter((o) => o.dOld >= 1 && o.dOld <= 60 && !SKIP.has(o.id.slice(0, 8)));
console.log('обновляю', good.length, 'из', out.length, '(сдвиг 1..60 км)');
if (APPLY) {
  for (const o of good) {
    const res = await db.from('events').update({ lat: o.lat, lng: o.lng }).eq('id', o.id).select('id,lat,lng');
    if (res.error || !res.data?.length) console.log('ОШИБКА', o.id.slice(0, 8), res.error?.message || 'нет строк');
    else console.log('записано', o.id.slice(0, 8), res.data[0].lat, res.data[0].lng);
  }
}
