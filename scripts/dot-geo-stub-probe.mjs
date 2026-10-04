// Точка «События»: поиск карточек с координатой-заглушкой (центр города), у которых
// адрес называет другой населённый пункт. Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,start_time,source_type,website');

// «центровые» точки, которые сборщик ставит, когда у источника нет площадки
const STUBS = {
  '34.7071': 'Лимасол',
  '34.7754': 'Пафос',
  '35.1856': 'Никосия',
  '34.9182': 'Ларнака',
  '35.0375': 'Ая-Напа',
  '35.1167': 'Фамагуста',
  '12.2388': 'Нячанг',
  '16.0544': 'Дананг',
};

const local = [
  ['Nikitari', 'Никитари'], ['Palaichori', 'Палеохори'], ['Omodos', 'Омодос'], ['Lefkara', 'Лефкара'],
  ['Polis', 'Полис'], ['Prodromi', 'Продроми'], ['Peyia', 'Пейя'], ['Coral Bay', 'Корал-Бей'],
  ['Germasogeia', 'Гермасойя'], ['Amathus', 'Аматус'], ['Mouttagiaka', 'Муттагьяка'], ['Pissouri', 'Писсури'],
  ['Paphos', 'Пафос'], ['Nicosia', 'Никосия'], ['Larnaca', 'Ларнака'], ['Limassol', 'Лимасол'],
  ['Ayia Napa', 'Ая-Напа'], ['Protaras', 'Протарас'], ['Paralimni', 'Паралимни'], ['Famagusta', 'Фамагуста'],
  ['Kyrenia', 'Кирения'], ['Kissonerga', 'Киссонерга'], ['Chloraka', 'Хлорака'], ['Perivolia', 'Периволия'],
  ['Tala', 'Тала'], ['Tsada', 'Цада'], ['Yeroskipou', 'Ероскипу'], ['Nata', 'Ната'], ['Anarita', 'Анарита'],
  ['Hoi An', 'Хойан'], ['Da Nang', 'Дананг'], ['Nha Trang', 'Нячанг'], ['Cam Ranh', 'Камрань'],
];

const hits = [];
for (const r of rows) {
  if (r.status === 'archived') continue;
  const key = String(Number(r.lat));
  const stubCity = STUBS[key];
  if (!stubCity || !r.address) continue;
  const addr = r.address;
  const mentioned = local.filter(([en, ru]) => new RegExp(en, 'i').test(addr) || addr.includes(ru)).map(([en]) => en);
  if (!mentioned.length) continue;
  // названная местность не совпадает с городом карточки
  const cityRu = (r.city || '').split(',')[0].trim();
  const bad = mentioned.filter((m) => {
    const pair = local.find(([en]) => en === m);
    return cityRu && !pair[1].startsWith(cityRu.slice(0, 5)) && cityRu !== pair[1];
  });
  if (bad.length) hits.push({ id: r.id.slice(0, 8), status: r.status, city: r.city, lat: r.lat, lng: r.lng, bad: bad.join(','), addr: addr.slice(0, 80), t: (r.title_ru || r.title || '').slice(0, 50) });
}
console.log('кандидатов', hits.length);
for (const h of hits) console.log(h.status, '|', h.id, '|', h.city, '|', h.lat + ',' + h.lng, '| ≠', h.bad, '|', h.t, '|', h.addr);

// сколько всего карточек на «заглушечных» координатах
const stubCount = {};
for (const r of rows) {
  if (r.status === 'archived') continue;
  const k = String(Number(r.lat)) + ',' + String(Number(r.lng));
  if (Object.keys(STUBS).some((s) => k.startsWith(s + ','))) stubCount[k] = (stubCount[k] || 0) + 1;
}
console.log('на центровых координатах:', JSON.stringify(stubCount));
