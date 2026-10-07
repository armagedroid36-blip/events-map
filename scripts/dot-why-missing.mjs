// Разбор «пропавших» страниц: статус и данные событий из списка проблем.
// Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs scripts/dot-why-missing.mjs <id> [<id>...]
import { createClient } from '@supabase/supabase-js';
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const ids = process.argv.slice(2);
const { data } = await db
  .from('events')
  .select('id, title, title_ru, title_en, source_lang, status, start_date, end_date, city, recurrence')
  .in('id', ids);
for (const ev of data ?? []) {
  console.log(`${ev.id.slice(0, 8)} [${ev.status}] ${ev.start_date}..${ev.end_date ?? '-'} sl=${ev.source_lang} city=${ev.city}`);
  console.log(`    title    : ${String(ev.title).slice(0, 70)}`);
  console.log(`    title_ru : ${String(ev.title_ru).slice(0, 70)}`);
  console.log(`    title_en : ${String(ev.title_en).slice(0, 70)}`);
  console.log(`    recurrence: ${JSON.stringify(ev.recurrence)}`);
}
