// Дозаполнение контактов событий из ТЕКСТА описания: WhatsApp, телефон,
// Telegram, email, Instagram.
//
// Зачем: коллекторы долго забирали только t.me-ссылки, поэтому «пишите в WA:
// + 62 821 4462 5492» в описании не превращалось в contact_whatsapp, и у
// организатора не было контакта на карточке. Новые сборы чиним в самих
// сборщиках (scripts/contacts-regex.mjs), этот скрипт — для уже собранных
// событий; шаг в collect-events.yml, чтобы правки организаторов тоже подхватывались.
//
// Правила: заполняем ТОЛЬКО пустые поля (ничего не перезаписываем), берём
// active + moderation. LLM не используется — только regex.
// Переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE; DRY_RUN=1, LIMIT (по умолчанию 400).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { extractContacts } from './contacts-regex.mjs';
import { resolveAuthorContact, signatureOf } from './contact-author.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 400);
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const FIELDS = 'id,title,status,description,description_ru,description_en,contact_telegram,contact_whatsapp,contact_phone,contact_email,contact_instagram';

async function main() {
  const all = await selectAll(db, 'events', FIELDS, {
    order: 'start_date',
    filter: (q) => q.in('status', ['active', 'moderation']),
  });
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  console.log(`Событий к проверке: ${rows.length} (из ${all.length} active+moderation)`);

  let updated = 0;
  const counts = { whatsapp: 0, phone: 0, telegram: 0, email: 0, instagram: 0 };
  // Поиск аккаунта по подписи «Пост от: …» — только когда контактов нет вовсе;
  // лимит запросов к t.me за прогон (кэш по подписи).
  const authorCache = new Map();
  const AUTHOR_LOOKUPS = Number(process.env.AUTHOR_LOOKUPS || 25);
  let authorLookups = 0;

  for (const ev of rows) {
    const text = [ev.description, ev.description_ru, ev.description_en].filter(Boolean).join('\n');
    if (!text) continue;
    const found = extractContacts(text);
    const patch = {};
    if (found.whatsapp && !ev.contact_whatsapp) patch.contact_whatsapp = found.whatsapp;
    if (found.phone && !ev.contact_phone) patch.contact_phone = found.phone;
    if (found.telegram && !ev.contact_telegram) patch.contact_telegram = found.telegram;
    if (found.email && !ev.contact_email) patch.contact_email = found.email;
    if (found.instagram && !ev.contact_instagram) patch.contact_instagram = found.instagram;
    // Совсем нет контактов + в описании подпись автора — ищем его аккаунт
    const anyContact = ev.contact_telegram || ev.contact_whatsapp || ev.contact_phone ||
      ev.contact_email || ev.contact_instagram;
    if (!anyContact && !Object.keys(patch).length && authorLookups < AUTHOR_LOOKUPS) {
      const sig = signatureOf(text);
      if (sig) {
        let tg = authorCache.get(sig);
        if (tg === undefined) {
          authorLookups++;
          tg = await resolveAuthorContact({ text, log: (m) => console.log('   ' + m.trim()) });
          authorCache.set(sig, tg);
        }
        if (tg) patch.contact_telegram = tg;
      }
    }
    if (!Object.keys(patch).length) continue;

    for (const [k, v] of Object.entries(patch)) {
      if (v) counts[k.replace('contact_', '')] += 1;
    }
    updated += 1;
    console.log(
      `${DRY_RUN ? '[dry] ' : ''}${ev.id.slice(0, 8)} | ${String(ev.title).slice(0, 40)} | ${Object.entries(patch).map(([k, v]) => `${k.replace('contact_', '')}=${v}`).join(' ')}`,
    );
    if (DRY_RUN) continue;
    const { error } = await db.from('events').update(patch).eq('id', ev.id);
    if (error) console.error(`  Ошибка обновления ${ev.id.slice(0, 8)}: ${error.message}`);
  }

  console.log(
    `Итог: ${DRY_RUN ? 'будет обновлено' : 'обновлено'} событий: ${updated}` +
    ` (wa: ${counts.whatsapp}, tel: ${counts.phone}, tg: ${counts.telegram}, mail: ${counts.email}, ig: ${counts.instagram})`,
  );
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
