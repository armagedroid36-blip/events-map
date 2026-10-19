// Зонд: живые карточки, чей город/пин ВНЕ геофокуса (Бали, Кипр, Нячанг, Дананг).
// Печатает распределение по city и список карточек вне фокуса. READ-ONLY.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const FOCUS = [
  /bali|бали|ubud|уbud|чанг|canggu|семиньяк|seminyak|кута|kuta|денпасар|denpasar|санур|sanur|нуса|nusa|джимбаран|jimbaran|амед|amed|сидемен|sidemen|ловин|lovina|табанан|tabanan|тегалаланг|t|кутух|чандидаса|чемаги|далунг|переренан|печату|pecatu|унгасан|ungasan|кедири|kediri|менгви|mengwi|бедугул|bedugul|карангасем|karangasem|сингараджа|singaraja|гиньяр|gianyar|бангли|bangli|клунгкунг|klungkung|джамбран|jembrana|negara/i,
  /кипр|cyprus|лимасол|limassol|никосия|nicosia|ларнак|larnaca|пафос|paphos|ая-?напа|ayia|protaras|протарас|паралимни|paralimni|фамагуст|famagusta|протарас|ларнака|лефкар|lefkara|полис|polis|пано|платрес|platres|киперунд|kyperounta|ларнака/i,
  /нячанг|nha trang|дананг|da nang|danang|хойан|hoi an|вьетнам|vietnam/i,
];

function inFocus(ev) {
  const s = `${ev.city || ''} ${ev.address || ''}`.toLowerCase();
  return FOCUS.some((re) => re.test(s));
}

const rows = await selectAll(db, 'events', 'id,title,city,address,status,start_date', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
console.log('живых строк:', rows.length);

const byCity = new Map();
for (const r of rows) byCity.set(r.city || '(пусто)', (byCity.get(r.city || '(пусто)') || 0) + 1);
const sorted = [...byCity.entries()].sort((a, b) => b[1] - a[1]);
console.log('городов:', sorted.length);
console.log('топ-25:', sorted.slice(0, 25).map(([c, n]) => `${c}=${n}`).join(' | '));

const out = rows.filter((r) => !inFocus(r));
console.log('ВНЕ ФОКУСА:', out.length);
for (const r of out.slice(0, 40)) {
  console.log(` - ${r.id} | ${r.status} | ${r.start_date} | ${r.city} | ${r.address || '-'} | ${String(r.title).slice(0, 60)}`);
}
