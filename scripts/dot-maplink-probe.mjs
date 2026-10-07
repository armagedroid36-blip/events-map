// Точка «События»: класс «источник дал ссылку на карту, но пин стоит на центровом фолбэке».
// Считает живые карточки, у которых в описании/адресе есть ссылка на карту (maps.app.goo.gl и др.),
// и показывает, стоит ли пин на известном центровом фолбэке города. Читающий.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const MAP_RE = /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})/i;
const URL_RE = /https?:\/\/[^\s)\]"'<>]*(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})[^\s)\]"'<>]*/i;

// известные центровые фолбэки сборщика
const FALLBACKS = [
  ['Нячанг', 12.2388, 109.1967],
  ['Дананг', 16.0544, 108.2022],
];

let rows = [];
for (let i = 0; i < 4; i++) {
  try { rows = await selectAll(db, 'events', 'id,status,city,address,description,website,title,start_date,lat,lng,source_type', { filter: q => q.eq('status', 'active') }); break; }
  catch (e) { console.log('retry', e.message); await new Promise(r => setTimeout(r, 2500)); }
}
console.log('живых', rows.length);

const hits = [];
for (const r of rows) {
  const blob = `${r.description || ''}\n${r.address || ''}`;
  if (!MAP_RE.test(blob)) continue;
  const url = (blob.match(URL_RE) || [''])[0].replace(/[.,;]+$/, '');
  const onFallback = FALLBACKS.some(([c, la, ln]) =>
    r.lat != null && r.lng != null && Math.abs(r.lat - la) <= 0.0012 && Math.abs(r.lng - ln) <= 0.0012);
  hits.push({ r, url, onFallback });
}
console.log('с ссылкой на карту в описании/адресе:', hits.length, '| из них на центровом фолбэке:', hits.filter(h => h.onFallback).length);
for (const h of hits.slice(0, 40)) {
  console.log(' ', h.r.id.slice(0, 8), h.r.status, h.r.city, h.r.start_date, h.onFallback ? 'ФОЛБЭК' : 'пин-не-фолбэк', `${h.r.lat},${h.r.lng}`,
    '| ' + (h.r.title || '').slice(0, 30), '|', h.url.slice(0, 70));
}
