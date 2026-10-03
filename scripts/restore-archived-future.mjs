// Разбор архивных событий с БУДУЩЕЙ датой: если близнеца (active, тот же день+название
// или та же ссылка) нет — вернуть в active. Удаления нет, только смена статуса.
// Запуск: node --env-file=.env scripts/restore-archived-future.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

const rows = await selectAll(db, 'events', 'id, title, title_ru, title_en, city, status, start_date, start_time, address, website, created_at');
const now = Date.now();
const day = (s) => (s ? new Date(s).toISOString().slice(0, 10) : '');
const norm = (s) => (s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();

// Ключ «живого близнеца» — ТОТ ЖЕ, что в dedupe-events.mjs (pruneArchivedCopies):
// дата + время + адрес + первые 3 слова названия. Без него скрипт восстанавливал
// карточку-дубль (второй источник с другим хвостом названия), и dedupe тут же
// архивировал её снова — вечная карусель (03.10.2026: e086a01c, edb5fbd6).
const prefixKey = (e) => {
  const words = norm(e.title_ru || e.title).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).slice(0, 3).join(' ');
  const addr = norm(e.address);
  if (!words || !addr || !e.start_time) return null;
  return [e.start_date, e.start_time, addr, words].join('|');
};
const prefixKeys = new Set(rows.filter((r) => r.status !== 'archived' && r.status !== 'rejected').map(prefixKey).filter(Boolean));

const archFuture = rows.filter((r) => r.status === 'archived' && r.start_date && Date.parse(r.start_date) > now);
console.log(`archived с будущей датой: ${archFuture.length}`);

const restore = [];
for (const r of archFuture) {
  const titles = new Set([norm(r.title), norm(r.title_ru), norm(r.title_en)].filter(Boolean));
  const d = day(r.start_date);
  const twins = rows.filter((o) => {
    if (o.id === r.id || o.status === 'archived' || o.status === 'rejected') return false;
    const sameDay = o.start_date && day(o.start_date) === d;
    const sameSite = r.website && o.website && o.website === r.website;
    if (sameSite) return true;
    if (!sameDay) return false;
    const ot = [norm(o.title), norm(o.title_ru), norm(o.title_en)].filter(Boolean);
    if (ot.some((t) => titles.has(t))) return true;
    // тот же ключ «живого близнеца» из dedupe: та же площадка+время+первые слова
    const k = prefixKey(r);
    return Boolean(k && prefixKey(o) === k);
  });
  const t = twins.map((o) => `${o.status}:${o.id.slice(0, 8)}`).join(',') || '—';
  const byKey = !titles.size ? false : prefixKeys.has(prefixKey(r));
  console.log(`${r.id.slice(0, 8)} | ${d} | ${r.city} | ${(r.title_ru || r.title || '').slice(0, 45)} | близнец: ${t}${byKey && t === '—' ? ' (ключ площадки занят живой карточкой)' : ''}`);
  if (!twins.length && !byKey) restore.push(r.id);
}
console.log(`без близнеца: ${restore.length} — ${restore.map((i) => i.slice(0, 8)).join(', ')}`);

if (APPLY && restore.length) {
  let ok = 0;
  for (const id of restore) {
    const { error } = await db.from('events').update({ status: 'active' }).eq('id', id);
    if (error) console.error('ошибка', id, error.message);
    else ok++;
  }
  console.log(`вернул в active: ${ok}`);
} else if (!APPLY) {
  console.log('(сухой прогон; для записи добавь --apply)');
}
