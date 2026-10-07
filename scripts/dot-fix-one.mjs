// Починка строки, испорченной тестовым PATCH: у 0b4b1d96 title_en был затёрт
// чужим названием. Возвращаем корректное значение.
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-fix-one.mjs
import { createClient } from '@supabase/supabase-js';
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

const ID = '0b4b1d96-7d07-4a5f-a06e-9d81c5301abf';
const { data: ev } = await db
  .from('events')
  .select('id, title, title_ru, title_en, description, description_ru, description_en, source_lang, language, status')
  .eq('id', ID)
  .single();

console.log('title    :', ev.title);
console.log('title_ru :', ev.title_ru);
console.log('title_en :', ev.title_en);
console.log('desc     :', String(ev.description).slice(0, 120).replace(/\n/g, ' '));
console.log('desc_ru  :', String(ev.description_ru).slice(0, 120).replace(/\n/g, ' '));
console.log('desc_en  :', String(ev.description_en).slice(0, 120).replace(/\n/g, ' '));

if (ev.title_en !== ev.title) {
  const { error } = await db.from('events').update({ title_en: ev.title }).eq('id', ID);
  console.log('правка title_en →', ev.title, '| ошибка:', error?.message ?? 'нет');
} else {
  console.log('title_en уже верный — правка не нужна');
}
