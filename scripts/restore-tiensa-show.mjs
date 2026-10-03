// Возврат ошибочно заархивированной живой карточки Tiên Sa Show (ежедневное шоу, Дананг)
// e92095ff: start_date 2026-10-04 (будущее), recurrence daily — archived по ошибке dedupe (см. pickKeeper).
// Скрипт возвращает её в moderation (публика её не видит до автопроверки — это безопасно).
// DRY_RUN=1 — только показать, что будет сделано.
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const DRY_RUN = process.env.DRY_RUN === '1';

async function findByPrefix(p) {
  const { data, error } = await db
    .from('events')
    .select('id,title,status,start_date,city,recurrence,created_at')
    .gte('id', `${p}-0000-0000-0000-000000000000`)
    .lte('id', `${p}-ffff-ffff-ffff-ffffffffffff`);
  if (error) throw new Error(error.message);
  return data;
}

const [row] = await findByPrefix('e92095ff');
if (!row) throw new Error('карточка e92095ff не найдена');
console.log('до:', row.id, row.status, row.start_date, row.city, JSON.stringify(row.recurrence));

if (row.status !== 'moderation') {
  if (DRY_RUN) {
    console.log('[dry] вернул бы в moderation');
  } else {
    const { error } = await db.from('events').update({ status: 'moderation' }).eq('id', row.id);
    if (error) throw new Error(error.message);
    console.log('вернул в moderation');
  }
}
const [after] = await findByPrefix('e92095ff');
console.log('после:', after.id, after.status, after.start_date);
