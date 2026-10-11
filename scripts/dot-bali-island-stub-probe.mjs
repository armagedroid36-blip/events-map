// Точка «События»: живые карточки, чей пин стоит на центре ОСТРОВА Бали
// (-8.4095,115.1889) — фолбэк, который берётся, когда район известен, но у канона
// нет центра в BALI_DISTRICT_CENTERS (до 40 км мимо района). Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const ISLAND = BALI_DISTRICT_CENTERS.bali;
const TOL = 0.0012; // ~130 м

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status,start_date,start_time,source_type,website');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
console.log('Всего строк', rows.length, '| живых', live.length);
console.log('Центр острова:', ISLAND.lat, ISLAND.lng, 'допуск', TOL);

const onIsland = live.filter((r) => r.lat != null && Math.abs(r.lat - ISLAND.lat) < TOL && Math.abs(r.lng - ISLAND.lng) < TOL);
console.log('\n== На центре острова:', onIsland.length);
for (const r of onIsland) {
  console.log(`${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${r.start_date} ${String(r.start_time || '').slice(0, 5)} | ${(r.title || '').slice(0, 60)} | ${(r.address || '').slice(0, 50)} | ${(r.website || '').slice(0, 60)}`);
}

// сколько живых балийских вообще и на каких центровых константах стоят
const bali = live.filter((r) => /bali/i.test(r.city || ''));
console.log('\nЖивых балийских:', bali.length);
const cnt = new Map();
for (const r of bali) {
  const key = `${r.lat},${r.lng}`;
  cnt.set(key, (cnt.get(key) || 0) + 1);
}
const centers = new Map(Object.entries(BALI_DISTRICT_CENTERS).map(([k, v]) => [`${v.lat},${v.lng}`, k]));
const onCenter = bali.filter((r) => centers.has(`${r.lat},${r.lng}`));
console.log('Стоят РОВНО на центре района:', onCenter.length);
const perLabel = new Map();
for (const r of onCenter) {
  const k = centers.get(`${r.lat},${r.lng}`);
  perLabel.set(k, (perLabel.get(k) || 0) + 1);
}
console.log('по меткам:', [...perLabel.entries()].map(([k, v]) => `${k}=${v}`).join(' '));
// из них у кого адрес называет конкретное место (не «Bali»/пусто) — кандидаты на уточнение пина
const withAddr = onCenter.filter((r) => r.address && r.address.trim().length > 4 && !/^bali$/i.test(r.address.trim()));
console.log('из них с непустым адресом:', withAddr.length);
for (const r of withAddr.slice(0, 25)) {
  console.log(`  ${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${r.start_date} | ${(r.title || '').slice(0, 50)} | адрес: ${(r.address || '').slice(0, 70)}`);
}
