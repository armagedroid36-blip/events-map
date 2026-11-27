#!/usr/bin/env node
// dot-1118: карточки, где САМ ИСТОЧНИК объявил еженедельный повтор, но поля `recurrence` нет —
// после своей даты такая карточка уходит из «предстоящих» и снимается гигиеной, хотя событие
// продолжается каждую неделю (прецедент 1074: Red Ruby MONDAY–SUNDAY).
// Класс ищется по названию: маркер регулярности («EVERY THURSDAY», «каждую пятницу», «по субботам»,
// «Old School Sundays») + день из маркера обязан совпасть с днём недели `start_date` — иначе не трогаем.
// «Movie Mondays: <фильм>» — НЕ цель: разные фильмы на разные понедельники, каждый показ одноразовый.
// DRY по умолчанию; APPLY=1 пишет. При 402 (egress quota) выходит с кодом 1 и ничего не пишет.

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }
const APPLY = process.env.APPLY === '1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' };

// id (8 знаков) -> ожидаемый день недели из названия (1=Пн … 7=Вс)
const TARGETS = {
  debd119e: 4, // EVERY THURSDAY — Bali Sunset Cruise with Live Barbeque, Беноа 26.11 16:00
  eb29e68a: 5, // Steak & Flame Every Friday at ORYn, Убуд 27.11 19:00–01:00
  '5781e87a': 5, // Morning Talk: разговорный клуб по пятницам, Нячанг 27.11 11:00
  '5a4c1481': 6, // Музыкальный квиз… «наши игры теперь будут по субботам», Дананг 28.11 18:00
  '036621f9': 7, // Old School Sundays in Larnaca, Ларнака 29.11 18:00
};
const MARK = /кажд\w+|еженедельн\w*|раз в неделю|по (?:понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям)|every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\w*|weekly/i;

function isoWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; // 1=Пн … 7=Вс
}
function hasRecurrence(r) {
  if (!r) return false;
  if (typeof r === 'string') return r.trim().length > 2 && r.trim() !== 'null' && r.trim() !== '{}';
  if (typeof r === 'object') return Object.keys(r).length > 0;
  return false;
}

(async () => {
  const sel = 'id,title,title_ru,title_en,start_date,end_date,recurrence';
  const r = await fetch(`${URL}/rest/v1/events?status=eq.active&select=${sel}`, { headers: H });
  const body = await r.text();
  if (r.status === 402 || /exceed_egress_quota/.test(body)) {
    console.error('402 egress quota — ремонт отменён:', body.slice(0, 140));
    process.exit(1);
  }
  if (!r.ok) { console.error('чтение:', r.status, body.slice(0, 140)); process.exit(1); }
  const rows = JSON.parse(body);
  const byPrefix = new Map(rows.map((x) => [x.id.slice(0, 8), x]));
  console.log(`живых прочитано: ${rows.length}, целей: ${Object.keys(TARGETS).length}`);

  let planned = 0;
  for (const [p, day] of Object.entries(TARGETS)) {
    const row = byPrefix.get(p);
    if (!row) { console.log(`MISS ${p} — карточка не active`); continue; }
    if (hasRecurrence(row.recurrence)) { console.log(`SKIP ${p} — recurrence уже есть: ${JSON.stringify(row.recurrence)}`); continue; }
    const titles = [row.title, row.title_ru, row.title_en].filter(Boolean);
    if (!titles.some((t) => MARK.test(t))) { console.log(`SKIP ${p} — маркера регулярности в названии нет`); continue; }
    const wd = isoWeekday(row.start_date);
    if (wd !== day) { console.log(`SKIP ${p} — день недели start_date ${row.start_date} = ${wd}, в названии ${day}`); continue; }
    const patch = {
      recurrence: { freq: 'weekly', days: [day] },
      end_date: null,
      auto_review: { verdict: 'publish', rule: 'recurrence-fix', note: `dot 1118: источник объявляет еженедельный повтор (день ${day} совпадает с ${row.start_date})` },
    };
    console.log(`${APPLY ? 'PATCH' : 'DRY'} ${p} weekly[${day}] end_date ${row.end_date} -> null | ${(row.title || '').slice(0, 60)}`);
    planned++;
    if (!APPLY) continue;
    const w = await fetch(`${URL}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    const out = await w.text();
    if (!w.ok) { console.error(`PATCH ${p} не прошёл:`, w.status, out.slice(0, 140)); continue; }
    const back = JSON.parse(out)[0];
    console.log(`readback ${p}: ${JSON.stringify(back.recurrence)} end_date=${back.end_date}`);
  }
  console.log(`${APPLY ? 'исправлено' : 'к ремонту'}: ${planned} из ${Object.keys(TARGETS).length}`);
})();
