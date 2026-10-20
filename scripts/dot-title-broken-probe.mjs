// Зонд: дефекты НАЗВАНИЙ живых карточек (обрезанная строка, мусор-приветствие, лишняя пунктуация).
//
// Зачем: парсер TG-афиш (collect-tg.mjs extractTitle) берёт ПЕРВУЮ подходящую строку поста.
// Автор афиши переносит строку по словам, поэтому в название попадает обрывок фразы
// («Открытый урок по», «Женская встреча в формате») — карточка на карте читается как мусор.
// Короткие названия («Всё это», «Живот», «Молоко») — законные имена спектаклей, дефектом НЕ считаются.
//
// Использование: node --env-file=.env scripts/dot-title-broken-probe.mjs
// Норма: «дефектов 0». Ремонт — только по странице источника (текст поста), без догадок.

import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const DANGLING = /(^|\s)(по|в|во|на|с|со|к|ко|о|об|обо|от|до|из|за|для|при|про|под|над|без|у|и|а|или|the|of|in|at|on|for|with|and|to)$/i;
const GREETING = /^(всем|друзья|привет|дорогие|внимание|анонс)[\s!.,:]/i;

function defect(t) {
  const s = String(t || '').trim();
  if (!s) return 'пустое';
  if (GREETING.test(s)) return 'мусор-приветствие в начале';
  if (DANGLING.test(s) && s.split(/\s+/).length >= 3) return 'обрыв фразы (висит предлог/союз)';
  // автор оборвал строку на двоеточии/тире/открывающей скобке — продолжение в следующей
  // строке поста: «Групповая встреча:» (карточка d867e413, 20.10.2026)
  if (/[:—–(,]$/.test(s)) return 'обрыв на пунктуации (двоеточие/тире/скобка)';
  if (/[\s.]+\.$/.test(s) && s.length < 200) return 'лишняя точка в конце';
  if (/\s\.\s/.test(s)) return 'точка с пробелами внутри';
  return null;
}

const rows = await selectAll(db, 'events', 'id, title, title_ru, city, address, start_date, website, source_type', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
const live = rows.length;
const bad = rows.map((r) => ({ r, why: defect(r.title_ru || r.title) })).filter((x) => x.why);
const info = rows.filter((r) => String(r.title_ru || r.title || '').trim().length < 10);

console.log(`живых: ${live} | дефектов названий: ${bad.length} | коротких названий (законные): ${info.length}`);
for (const b of bad) {
  console.log(` ${b.r.id.slice(0, 8)} | ${b.why} | ${JSON.stringify(b.r.title_ru || b.r.title)} | ${b.r.city} | ${b.r.start_date} | ${b.r.source_type} | ${b.r.website}`);
}
const byWhy = {};
for (const b of bad) byWhy[b.why] = (byWhy[b.why] || 0) + 1;
console.log('по причинам:', JSON.stringify(byWhy));
const noAddr = rows.filter((r) => !String(r.address || '').trim());
const noAddrTg = noAddr.filter((r) => String(r.website || '').includes('t.me/'));
console.log(`без адреса: ${noAddr.length} (из них TG-афиши: ${noAddrTg.length})`);
