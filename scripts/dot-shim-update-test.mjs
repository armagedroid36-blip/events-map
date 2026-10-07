// Проверка шима: PATCH через supabase-js БЕЗ ИЗМЕНЕНИЯ ДАННЫХ (idempotent:
// пишем в поле его же значение) + чтение строки. ВАЖНО: не подставлять сюда
// «примерные» значения — этот скрипт пишет в БОЕВУЮ таблицу.
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-shim-update-test.mjs
import { createClient } from '@supabase/supabase-js';
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

const ID = '0b4b1d96-7d07-4a5f-a06e-9d81c5301abf';
const { data: before, error: e1 } = await db
  .from('events')
  .select('id, title_en')
  .eq('id', ID)
  .single();
console.log('ДО title_en:', before?.title_en, '| ошибка:', e1?.message);

const res = await db.from('events').update({ title_en: before?.title_en }).eq('id', ID);
console.log('PATCH success:', res.success, '| status:', res.status, '| error:', res.error?.message ?? 'нет');

const { data: after } = await db.from('events').select('id, title_en').eq('id', ID).single();
console.log('ПОСЛЕ title_en:', after?.title_en);
