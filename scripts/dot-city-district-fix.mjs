// Ремонт city по округу координат (проверено обратным геокодером Nominatim).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const FIX = [
  ['0c4a3587', 'Никосия, Кипр'], ['8e5dcb10', 'Никосия, Кипр'], ['dca2b8b1', 'Никосия, Кипр'],
  ['22f4448c', 'Никосия, Кипр'], ['f38ba9db', 'Никосия, Кипр'], ['ca2ae130', 'Никосия, Кипр'],
  ['b158f1f8', 'Никосия, Кипр'], ['0086113e', 'Никосия, Кипр'], ['866a93dc', 'Никосия, Кипр'],
  ['3845e750', 'Ларнака, Кипр'], ['39d02564', 'Ларнака, Кипр'], ['72748cc5', 'Ларнака, Кипр'],
  ['7de15bab', 'Ларнака, Кипр'], ['955f4c46', 'Никосия, Кипр'],
  ['0f733c84', 'Лимасол, Кипр'],
];
const rows = await selectAll(db, 'events', 'id,city,address,status');
const byPref = new Map(rows.map((r) => [r.id.slice(0, 8), r]));
for (const [pref, city] of FIX) {
  const r = byPref.get(pref);
  if (!r) { console.log(pref, 'нет карточки'); continue; }
  if (!APPLY) { console.log(pref, r.status, r.city, '->', city, '|', (r.address || '').slice(0, 50)); continue; }
  const res = await db.from('events').update({ city }).eq('id', r.id).select('id,city');
  console.log(res.error || !res.data?.length ? ['ОШИБКА', pref, res.error?.message || '0 строк'].join(' ') : ['записано', pref, r.city, '->', res.data[0].city].join(' '));
}
