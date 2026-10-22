import { createClient } from '@supabase/supabase-js';
const APPLY = process.env.APPLY === '1';
const SINCE = process.env.SINCE || '2026-10-21T22:26:41Z';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const CENTER = { 'Лимасол': [34.7071, 33.0226], 'Никосия': [35.1856, 33.3823], 'Пафос': [34.7754, 32.4245], 'Ларнака': [34.9182, 33.6194] };
const EN = { 'Лимасол': 'limassol', 'Никосия': 'nicosia', 'Пафос': 'paphos', 'Ларнака': 'larnaca' };
const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const cyr = s => /[а-яё]/i.test(s || '');

// адрес карточки -> [запрос в CN, обязательный токен в имени площадки]
const Q = {
  'Муниципальный театр Строволоса': ['strovolos municipal theatre', 'strovolos'],
  'Дасти Манки Бар': ['dusty munky', 'dusty'],
  'Театр Паттихо': ['pattihio', 'pattih'],
  'Берлин Митс': ['berlin', 'berlin'],
  'Монте Капуто': ['monte caputo', 'caputo'],
  'Кинотеатр-театр Акрополь': ['acropol', 'acropol'],
  'Тсифликудион': ['tsiflikoudia', 'tsifl'],
  'Муниципальный театр Ипсонаса': ['ypsona', 'ypson'],
  'Театро Эна': ['theatro ena', 'theatro'],
  'Галерея The Edit': ['the edit', 'edit'],
  'Транзишн Хаб': ['transition', 'transition'],
  'Арт-центр Диатопос': ['diatopos', 'diatop'],
  'Мьюзик Холл': ['music hall', 'music'],
  'Кераси Бар Никосия': ['kerasi', 'kerasi'],
  'Той Таун Пафос': ['toy town', 'toy'],
  'Культурный центр деревни Пелендри': ['pelendri', 'pelend'],
  'Муниципальный театр Никосии': ['municipal theatre nicosia', 'municipal'],
  'Винегар Фэктори': ['vinegar', 'vinegar'],
  'Кипрский музей': ['cypriot museum', 'cypriot'],
  'Мейсон Бар': ['mason', 'mason'],
  'Клуб Teez - главный RnB-клуб Никосии': ['teez', 'teez'],
  'Фабрика Колла': ['kolla', 'kolla'],
  "Джаз-блюз-клуб Sarah's Jazz": ['sarah', 'sarah'],
  'Площадь Элефтерия': ['eleftheria square', 'elefther'],
  'The Hill': ['the hill', 'hill'],
  'Кикламинон - Мультиспейс': ['kiklamino', 'kiklam'],
  'Пиццерия «Нонна Роза»': ['nonna rosa', 'nonna'],
  'Культурный зал Пано-Полемидии': ['pano polemidia', 'polemi'],
  'Частная школа Trinity (начальная)': ['trinity', 'trinity'],
  'Кемпинг Лумата Скаут': ['loumata', 'loumat'],
  'Сити Плаза': ['city plaza', 'plaza'],
  'Старый город Пафоса': ['old town paphos', 'old town'],
  'Спортивный клуб «Гимнастикос Силлогос Кимон Ксилотимпу»': ['kimon xylotymbou', 'kimon'],
  'Центр исполнительских искусств Synergeio': ['synergeio', 'synerg'],
};

async function all(from) {
  let out = []; let off = 0;
  for (;;) {
    const { data, error } = await db.from('events').select('id,title,city,address,lat,lng,start_date,status,website,created_at')
      .gte('created_at', from).order('created_at', { ascending: true }).range(off, off + 999);
    if (error) throw new Error(error.message);
    out = out.concat(data); if (data.length < 1000) break; off += 1000;
  }
  return out;
}

const cache = new Map();
async function cn(q) {
  if (cache.has(q)) return cache.get(q);
  let res = [];
  try {
    const r = await fetch(`https://cyprusnow.app/api/events?q=${encodeURIComponent(q)}&limit=100`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const j = await r.json(); res = j.events || [];
  } catch (e) { res = []; }
  cache.set(q, res); return res;
}

const rows = await all(SINCE);
const live = rows.filter(r => r.status === 'active');
const cands = [];
for (const r of live) {
  const cityKey = (r.city || '').split(',')[0].trim(); const c = CENTER[cityKey]; if (!c || r.lat == null) continue;
  if (Math.abs(r.lat - c[0]) > 0.0012 || Math.abs(r.lng - c[1]) > 0.0012) continue;
  const addr = (r.address || '').split(',')[0].trim();
  if (!addr || addr.length < 3) continue;
  cands.push({ r, cityKey, c, addr });
}
console.log('кандидатов:', cands.length);

async function resolve(x) {
  const { cityKey, c, addr } = x;
  const q = Q[addr] ? Q[addr][0] : (cyr(addr) ? null : addr);
  const key = Q[addr] ? Q[addr][1] : norm(addr).split(' ')[0];
  if (!q) return null;
  const hits = await cn(q);
  for (const e of hits) {
    const v = e.venue || {};
    if (v.lat == null || v.lng == null) continue;
    if (!(v.city || '').toLowerCase().includes(EN[cityKey])) continue;
    if (Math.abs(v.lat - c[0]) < 0.0015 && Math.abs(v.lng - c[1]) < 0.0015) continue; // центроид
    const vn = norm(v.name);
    if (!key || !vn.includes(norm(key).slice(0, Math.max(4, Math.min(norm(key).length, 6))))) continue;
    return { lat: +(+v.lat).toFixed(7), lng: +(+v.lng).toFixed(7), venue: v.name, city: v.city };
  }
  return null;
}

const picks = [];
for (let i = 0; i < cands.length; i += 6) {
  const batch = await Promise.all(cands.slice(i, i + 6).map(x => resolve(x).catch(() => null)));
  picks.push(...batch);
}
const BAD_ADDR = new Set(['Кинотеатр-театр Акрополь']); // CN даёт парк Acropolis, а не кинотеатр — не площадка
const got = cands.map((x, i) => ({ x, pick: picks[i] })).filter(p => p.pick && !BAD_ADDR.has(p.x.addr));
console.log('нашлась площадка:', got.length, APPLY ? '(APPLY)' : '(DRY)');
for (const p of got) console.log('  ', p.x.r.id.slice(0, 8), '|', p.x.cityKey, '|', p.x.addr, '=>', p.pick.venue, p.pick.lat, p.pick.lng);

if (APPLY) {
  const seen = new Set();
  let ok = 0;
  for (const p of got) {
    if (seen.has(p.x.r.id)) continue; seen.add(p.x.r.id);
    const { data, error } = await db.from('events').update({ lat: p.pick.lat, lng: p.pick.lng }).eq('id', p.x.r.id).eq('status', 'active').select('id,lat,lng,city,address,status');
    if (error) { console.log('ERR', p.x.r.id, error.message); continue; }
    if (!data || !data.length || Math.abs(data[0].lat - p.pick.lat) > 1e-6) { console.log('NOT-UPDATED', p.x.r.id); continue; }
    ok++;
  }
  console.log('обновлено пинов:', ok);
}
