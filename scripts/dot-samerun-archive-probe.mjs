// Подкласс: карточки, заархивированные В ТОМ ЖЕ ПРОГОНЕ, что и вставлены
// (updated_at - created_at <= 30 мин) и не имеющие близнеца ни по названию/ссылке, ни мягкого.
// Это ровно сигнатура дефекта запуска 124 (дедуп склеивает разные события одной площадки и
// тут же отправляет свежую уникальную карточку в архив).
// Для каждой такой карточки печатаем лучшего живого соседа (тот же день+город) по пересечению слов.
// Запуск: node --env-file=.env scripts/dot-samerun-archive-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { norm, aliases, cityKey, overlap } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);
const cols = 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,created_at,updated_at';
const archived = await selectAll(db, 'events', cols, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']) });

const canon = (u) => { if (!u) return null; try { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return null; } };
const liveTitles = new Set(), liveSites = new Set(), liveDayCity = new Map();
for (const r of live) {
  const day = (r.start_date || '').slice(0, 10);
  for (const a of aliases(r)) liveTitles.add(`${day}|${norm(a)}`);
  const c = canon(r.website); if (c) liveSites.add(c);
  const k = `${day}|${cityKey(r)}`;
  if (!liveDayCity.has(k)) liveDayCity.set(k, []);
  liveDayCity.get(k).push(r);
}
const hasTwin = (a) => {
  const day = (a.start_date || '').slice(0, 10);
  if (aliases(a).some((al) => liveTitles.has(`${day}|${norm(al)}`))) return true;
  const c = canon(a.website); if (c && liveSites.has(c)) return true;
  return false;
};
const mins = (a) => (new Date(a.updated_at) - new Date(a.created_at)) / 60000;

const rows = archived.filter((a) => mins(a) <= 30 && !hasTwin(a) && !(liveDayCity.get(`${(a.start_date || '').slice(0, 10)}|${cityKey(a)}`) || []).some((b) => overlap(a, b) >= 3));
console.log(`архивных будущих ${archived.length}; «архив в том же прогоне без близнеца»: ${rows.length}`);
for (const a of rows.sort((x, y) => x.updated_at.localeCompare(y.updated_at))) {
  const k = `${(a.start_date || '').slice(0, 10)}|${cityKey(a)}`;
  const cand = (liveDayCity.get(k) || []).map((b) => ({ b, ov: overlap(a, b) })).sort((x, y) => y.ov - x.ov).slice(0, 2);
  console.log(`\narch ${a.id.slice(0, 8)} «${(a.title_ru || a.title || '').slice(0, 70)}» ${(a.start_date || '').slice(0, 10)} ${a.start_time || ''} ${cityKey(a)} | ${a.website || '-'}`);
  console.log(`   создана ${a.created_at.slice(0, 16)} архив ${a.updated_at.slice(0, 16)} (${Math.round(mins(a))} мин) адрес: ${(a.address || '-').slice(0, 70)}`);
  for (const { b, ov } of cand) console.log(`   сосед ${b.id.slice(0, 8)} ov=${ov} «${(b.title_ru || b.title || '').slice(0, 60)}» ${b.start_time || ''} ${b.website || '-'}`);
}
