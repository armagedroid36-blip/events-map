// Точка «События»: класс «диапазон дат прямо в названии, а end_date пуст».
// Источник (лента/пост) сам называет конец события в заголовке — берём его в end_date.
// Осторожно: только живые карточки, только будущие, только однозначные формы; APPLY=1 для записи.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';

const MONTHS = {
  январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6, июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12,
};
const MONTHS_EN = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function monthRu(word) {
  const w = word.toLowerCase().replace(/[^а-яё]/g, '');
  for (const [stem, num] of Object.entries(MONTHS)) {
    if (w.startsWith(stem)) return num;
  }
  return null;
}
function monthEn(word) {
  return MONTHS_EN[word.toLowerCase()] || null;
}
const pad = (n) => String(n).padStart(2, '0');

/** Вернуть ISO-дату конца, если заголовок прямо её называет. */
function rangeEnd(title, startDate) {
  if (!title || !startDate) return null;
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const t = title.replace(/\u00a0/g, ' ');

  // «5–6 ноября», «5-6 ноября», «10 – 11 октября», «5 и 6 ноября»
  let m = t.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+([А-Яа-яЁё]{3,})/);
  if (m) {
    const mon = monthRu(m[3]);
    const d1 = Number(m[1]), d2 = Number(m[2]);
    if (mon === sm && d2 > d1) return `${sy}-${pad(sm)}-${pad(d2)}`;
  }
  // «2–8.11», «2-8.11.2026»
  m = t.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (m) {
    const mon = Number(m[3]);
    const d1 = Number(m[1]), d2 = Number(m[2]);
    const year = m[4] ? Number(m[4]) : sy;
    if (mon === sm && d2 > d1 && year === sy) return `${sy}-${pad(sm)}-${pad(d2)}`;
  }
  // «до 29 ноября» / «по 29 ноября» (дата окончания прямо названа)
  m = t.match(/(?:до|по)\s+(\d{1,2})\s+([А-Яа-яЁё]{3,})/);
  if (m) {
    const mon = monthRu(m[2]);
    const d2 = Number(m[1]);
    if (mon && !(mon === sm && d2 <= sd) && mon >= sm) {
      const year = mon < sm ? sy + 1 : sy;
      const spanDays = (new Date(`${year}-${pad(mon)}-${pad(d2)}`) - new Date(startDate)) / 86400000;
      if (spanDays > 0 && spanDays <= 60) return `${year}-${pad(mon)}-${pad(d2)}`;
    }
  }
  // «November 5-6», «November 5–6»
  m = t.match(/([A-Za-z]{3,})\s+(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (m) {
    const mon = monthEn(m[1]);
    const d1 = Number(m[2]), d2 = Number(m[3]);
    if (mon === sm && d2 > d1) return `${sy}-${pad(sm)}-${pad(d2)}`;
  }
  return null;
}

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,title_en,start_date,end_date,recurrence,city,website');
const today = new Date().toISOString().slice(0, 10);
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status) && r.start_date >= today && !r.end_date && !r.recurrence);

const hits = [];
for (const r of live) {
  for (const field of ['title', 'title_ru', 'title_en']) {
    const val = r[field];
    if (!val) continue;
    const end = rangeEnd(val, r.start_date);
    if (end && end > r.start_date) {
      hits.push({ row: r, end, field, val });
      break;
    }
  }
}

console.log(`живых будущих без end_date: ${live.length} | кандидатов «диапазон в названии»: ${hits.length}`);
for (const h of hits) {
  console.log(`${h.row.id.slice(0, 8)} | ${h.row.status} | ${h.row.start_date} → ${h.end} | ${h.row.city} | ${h.val.slice(0, 80)}`);
  console.log(`     источник: ${(h.row.website || '—').slice(0, 100)}`);
}

if (APPLY) {
  let ok = 0, fail = 0;
  for (const h of hits) {
    const { error } = await db.from('events').update({ end_date: h.end }).eq('id', h.row.id).select('id');
    if (error) { console.log('ОШИБКА', h.row.id, error.message); fail++; continue; }
    const { data } = await db.from('events').select('id,end_date,start_date,status,city,lat,lng').eq('id', h.row.id).maybeSingle();
    if (data && data.end_date === h.end && data.start_date === h.row.start_date) {
      ok++;
      console.log(`  записано: ${h.row.id.slice(0, 8)} end_date=${data.end_date} (дата/статус не менялись: ${data.status})`);
    } else { fail++; console.log('  контроль не сошёлся', h.row.id, JSON.stringify(data)); }
  }
  console.log(`итог: записано ${ok}, ошибок ${fail}`);
}
