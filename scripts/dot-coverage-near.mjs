// Зонд покрытия карты НА БЛИЖАЙШЕЕ ОКНО (7 и 14 дней) по меткам city.
// Отвечает на вопрос «где карта выглядит пустой у пользователя сегодня», а не
// «есть ли будущее событие вообще» (это dot-coverage-ahead.mjs).
// Событие считается живым в окне, если началось до конца окна и не закончилось
// до его начала (учитывается end_date: многодневные фестивали держат метку).
// Норма: меток без событий в 14 дней — 0; тонкие метки (<=2) печатаются списком.
// Запуск: node --env-file=.env scripts/dot-coverage-near.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,title,start_date,end_date,city,lat,lng', { filter: q => q.eq('status', 'active') });
const live = rows;
const d = s => new Date(String(s).slice(0, 10) + 'T00:00:00Z').getTime();
const DAY = 86400000;
const now = Date.now();
console.log(`живых ${live.length}, сегодня ${new Date(now).toISOString().slice(0, 10)}`);

const covers = (r, to) => {
  const s = d(r.start_date);
  const e = r.end_date ? d(r.end_date) : s;
  return s <= to && e >= now - DAY;
};

for (const win of [7, 14]) {
  const to = now + win * DAY;
  const inWin = live.filter(r => covers(r, to));
  const byCity = new Map();
  for (const r of inWin) byCity.set(r.city, (byCity.get(r.city) || 0) + 1);
  const sorted = [...byCity.entries()].sort((a, b) => a[1] - b[1]);
  console.log(`\n== окно ${win} дн: карточек ${inWin.length}, меток ${sorted.length}`);
  console.log(sorted.map(([c, n]) => `${c}=${n}`).join(', '));
}

const to14 = now + 14 * DAY;
const alive14 = new Map();
for (const r of live) if (covers(r, to14)) alive14.set(r.city, (alive14.get(r.city) || 0) + 1);
const allCities = [...new Set(live.map(r => r.city))];
const empty = allCities.filter(c => !alive14.has(c));
const thin = [...alive14.entries()].filter(([, n]) => n <= 2).map(([c]) => c);
console.log(`\n== меток всего ${allCities.length}`);
console.log(`без событий на 14 дн (${empty.length}): ${empty.join(', ') || 'нет'}`);
console.log(`тонкие <=2 на 14 дн (${thin.length}): ${thin.join(', ') || 'нет'}`);
process.exit(empty.length ? 0 : 0);
