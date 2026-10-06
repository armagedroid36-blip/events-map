// Проверка ключа кандидата из листинга (dot-events): воспроизводит anchoredKey /
// candidateAnchoredKey из scripts/collect-theatres.mjs на РЕАЛЬНЫХ строках базы.
// Цель: доказать, что следующий суточный кандидат листинга danang365 сматчится с
// живой карточкой серии, а не вставится клоном (#tien-sa-show-2).
// Запуск: node --env-file=.env scripts/dot-theatre-anchor-key-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// --- копия ключевых функций сборщика ---
function normUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = new URL(s);
    return `${x.host.replace(/^www\./i, '').toLowerCase()}${x.pathname.replace(/\/+$/, '').toLowerCase()}${x.hash.toLowerCase()}`;
  } catch {
    return s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}
const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
function anchoredKey(url, title) {
  const n = normUrl(url);
  if (!n || !n.includes('#')) return null;
  return `${n.replace(/#(.+?)-\d+$/, '#$1')}|${normKey(title)}`;
}
function anchorSlug(ev) {
  return String(ev.title_en || ev.title || 'show')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function candidateAnchoredKey(ev, src) {
  const direct = anchoredKey(ev.website, ev.title);
  if (direct) return direct;
  const base = String(ev.website || (src && src.kind === 'listing' ? src.url : '') || '').split('#')[0];
  const slug = anchorSlug(ev);
  if (!base || !ev.title || !slug) return null;
  return anchoredKey(`${base}#${slug}`, ev.title);
}

const rows = await selectAll(db, 'events', 'id,title,title_en,status,website,start_date');
const li = rows.filter((r) => String(r.website || '').includes('du-lich-da-nang-show-dien-2'));
const live = li.find((r) => r.status === 'active' && r.title === 'Tiên Sa Show')
  || li.find((r) => r.status === 'active' && String(r.website).includes('tien-sa-show') && !String(r.website).includes('tien-sa-show-'));
console.log(`строк листинга: ${li.length}, живая карточка серии Tiên Sa Show: ${live ? live.id.slice(0, 8) + ' ' + live.start_date : 'НЕТ'}`);

// 1) ключ живой карточки (как его видит byAnchored)
const liveKey = anchoredKey(live.website, live.title);
console.log(`ключ живой:        ${liveKey}`);

// 2) кандидат завтрашнего прогона: листинг отдаёт общий адрес БЕЗ якоря
const base = String(live.website).split('#')[0];
const cand1 = { title: live.title, title_en: live.title_en, website: base };
const keyNoHash = candidateAnchoredKey(cand1, { kind: 'listing', url: base });
console.log(`ключ кандидата:    ${keyNoHash}`);
console.log(`кандидат без website (только src.url): ${candidateAnchoredKey({ title: live.title, title_en: live.title_en }, { kind: 'listing', url: base })}`);

// 3) клон сегодняшнего прогона (#tien-sa-show-2) — старый ключ его не видел
const clone = li.find((r) => String(r.website).includes('tien-sa-show-2'));
if (clone) {
  const oldKey = `${normUrl(clone.website)}|${normKey(clone.title)}`;
  console.log(`клон ${clone.id.slice(0, 8)}: старый ключ = ${oldKey}`);
  console.log(`  совпадение старого ключа с живой: ${oldKey === `${normUrl(live.website)}|${normKey(live.title)}` ? 'ДА' : 'НЕТ'} (так и рождался клон)`);
  console.log(`  совпадение нового ключа клона с живой: ${anchoredKey(clone.website, clone.title) === liveKey ? 'ДА' : 'НЕТ'} (снятие служебного -N)`);
}

const ok = keyNoHash && liveKey && keyNoHash === liveKey;
console.log(ok ? 'ИТОГ: ключ кандидата = ключ живой карточки → следующий прогон НЕ создаст клон' : 'ИТОГ: ПРОВАЛ — ключи расходятся');
process.exit(ok ? 0 : 1);
