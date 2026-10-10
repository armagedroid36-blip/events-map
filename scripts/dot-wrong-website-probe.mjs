// Класс «ссылка карточки ведёт на страницу источника с ДРУГОЙ датой» (дефект: website чужого события).
// Признак: website — страница события с датой в конце слага (`.../event/<slug>-YYYY-MM-DD`),
// а дата в слаге не совпадает с start_date карточки. Плюс: две живые карточки делят ОДНУ страницу /event/.
// Запуск: node --env-file=.env scripts/dot-wrong-website-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const LIVE = new Set(['active', 'moderation', 'needs_changes']);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', '*');
const live = rows.filter((r) => LIVE.has(r.status) && r.website);

// 1) дата в слаге страницы события vs start_date карточки
const mism = [];
for (const r of live) {
  let u = '';
  try { u = decodeURIComponent(String(r.website)); } catch { u = String(r.website); }
  const m = u.match(/\/event\/([^/?#]+)-(\d{4})-(\d{2})-(\d{2})\/?$/);
  if (!m) continue;
  const slugDate = `${m[2]}-${m[3]}-${m[4]}`;
  if (!r.start_date) continue;
  if (slugDate !== r.start_date) mism.push({ r, slugDate, url: r.website });
}
console.log(`живых со ссылкой: ${live.length}; страниц события с датой в слаге: ${live.filter((r) => { try { return /\/event\/[^/?#]+-\d{4}-\d{2}-\d{2}\/?$/.test(decodeURIComponent(String(r.website))); } catch { return false; } }).length}`);
console.log(`карточек, где дата слага != start_date: ${mism.length}`);
for (const { r, slugDate, url } of mism) {
  console.log('  ', String(r.id).slice(0, 8), r.status, r.start_date, `(слаг ${slugDate})`, '|', String(r.title).slice(0, 60), '|', url.slice(0, 110));
}

// 2) две+ живые карточки делят одну страницу /event/
const byUrl = new Map();
for (const r of live) {
  if (!/\/event\//.test(String(r.website))) continue;
  const u = String(r.website).trim();
  if (!byUrl.has(u)) byUrl.set(u, []);
  byUrl.get(u).push(r);
}
const shared = [...byUrl.entries()].filter(([, l]) => l.length > 1);
console.log(`страниц /event/, которые делят 2+ живые карточки: ${shared.length}`);
for (const [url, l] of shared) {
  console.log('---', url);
  for (const r of l) console.log('   ', String(r.id).slice(0, 8), r.status, r.start_date, '|', String(r.title).slice(0, 60));
}
