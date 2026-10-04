// dot-events: ремонт дублей-написаний районов Бали в поле city (city = '<район>, Bali').
// Только живые карточки (active/moderation/needs_changes) — архивные на карте не видны.
// Запуск: node --env-file=.env scripts/dot-bali-district-fix.mjs            (сухой прогон)
//         node --env-file=.env scripts/dot-bali-district-fix.mjs --apply    (запись)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE);

// Легаси-значение city → канон. Каждое обосновано адресом карточки (проверено 04.10).
const CITY_FIX = {
  // один и тот же район Улувату/Печату (храм Улувату стоит в Печату)
  'Улувату, Bali': 'Печату (Улувату), Bali',
  // Нуса-Дуа и Беноа — одна зона (ITDC Nusa Dua, Benoa, Kec. Kuta Sel.)
  'Нуса-Дуа, Bali': 'Беноа (Нуса Дуа), Bali',
  'Букит, Bali': 'Беноа (Нуса Дуа), Bali', // адрес: Benoa, Kec. Kuta Sel.
  // источник не знает район → определили по адресу (Kediri, Tabanan)
  'Нет в списке, Bali': 'Табанан, Bali',
  // адреса: Ubud / Sayan / Penestanan, Kecamatan Ubud
  'Гианьяр, Bali': 'Убуд, Bali',
  // адрес: Kerobokan Kelod, Kec. Kuta Utara
  'Денпасар, Bali': 'Керобокан, Bali',
  // вне геофокуса: адрес и координаты Джакарты (Tanah Abang, Jakarta Pusat)
  'Бангли, Bali': 'Джакарта',
};

const rows = await selectAll(db, 'events', 'id,status,city,title,address', {
  filter: (q) => q.like('city', '%Bali%').in('status', ['active', 'moderation', 'needs_changes']),
});
const targets = rows.filter((r) => CITY_FIX[r.city]);
console.log(`живых «… Bali»: ${rows.length} | к правке: ${targets.length}`);
for (const r of targets) console.log(`  ${r.city} → ${CITY_FIX[r.city]} | ${r.id.slice(0, 8)} | ${r.title.slice(0, 45)}`);

if (!APPLY) { console.log('\n[сухой прогон] для записи добавь --apply'); process.exit(0); }

// Правим по группам: один UPDATE на канон — нужно проверить число изменённых строк.
const groups = {};
for (const r of targets) (groups[CITY_FIX[r.city]] = groups[CITY_FIX[r.city]] || []).push(r.id);
let changed = 0;
for (const [canon, ids] of Object.entries(groups)) {
  const { data, error } = await db.from('events').update({ city: canon }).in('id', ids).select('id');
  if (error) { console.log(`ОШИБКА ${canon}: ${error.message}`); continue; }
  console.log(`  ${canon}: обновлено ${data.length} из ${ids.length}`);
  changed += data.length;
}
console.log(`\nитого обновлено строк: ${changed}`);
