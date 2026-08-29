// Backfill адресов: у событий на модерации с address = null вычленяем место
// из описания (LLM с retry, при сбое — regex-fallback). Запускается в
// GitHub Actions после сбора Telegram; лимит 50 событий за запуск.
import { createClient } from '@supabase/supabase-js';
import { extractAddressLLM } from './address-llm.mjs';
import { extractAddress } from './address-regex.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 50); // предохранитель: токены LLM

async function main() {
  const { data, error } = await db
    .from('events')
    .select('id, title, description, city')
    .eq('status', 'moderation')
    .is('address', null)
    .limit(LIMIT);
  if (error) throw error;

  const rows = data || [];
  let filled = 0;
  for (const ev of rows) {
    const text = `${ev.description || ''} ${ev.title || ''}`.trim();
    if (!text) continue;
    const llm = await extractAddressLLM(text, ev.city);
    const address = llm?.address || extractAddress(text, ev.city) || null;
    if (!address) continue;

    const { error: uErr } = DRY_RUN
      ? { error: null }
      : await db.from('events').update({ address }).eq('id', ev.id);
    if (uErr) {
      console.error(`  Ошибка обновления «${String(ev.title).slice(0, 40)}»: ${uErr.message}`);
    } else {
      filled++;
      console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${String(ev.title).slice(0, 45)} | ${address}`);
    }
  }

  console.log(`Готово: заполнено ${filled} из ${rows.length}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
