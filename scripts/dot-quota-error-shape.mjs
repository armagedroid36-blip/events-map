// Зонд: сравнить, как приходит ошибка 402 у РАЗНЫХ форм запроса.
// Причина: dedupe падает с пустым «events: » — значит в одной из форм ответа
// supabase-js теряет message. Здесь видно, в какой именно.
// Запуск: node --env-file=.env scripts/dot-quota-error-shape.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) {
  console.error('Нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении');
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const shapes = [
  ['select id limit 1', () => db.from('events').select('id').limit(1)],
  ['select cols order range', () => db.from('events').select('id, title, start_date').order('id').range(0, 999)],
  ['select with in filter', () => db.from('events').select('id, title').in('status', ['active', 'moderation']).order('id').range(0, 999)],
  ['count head', () => db.from('events').select('*', { count: 'exact', head: true })],
  ['update dry (id eq fake)', () => db.from('events').update({ status: 'archived' }).eq('id', '00000000-0000-0000-0000-000000000000')],
];

for (const [name, q] of shapes) {
  let out;
  try {
    const res = await q();
    out = res && res.error ? res.error : { error: null, note: 'нет ошибки' };
  } catch (e) {
    out = { thrown: String((e && e.message) || e) };
  }
  const msg = out.message;
  console.log(
    `${name}: error=${out.error === null ? 'none' : 'yes'} messageLen=${String(msg ?? '').length} ` +
      `msg=${String(msg ?? '').slice(0, 90)} keys=${JSON.stringify(Object.keys(out))}`
  );
}
