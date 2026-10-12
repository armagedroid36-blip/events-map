// Класс «ложная склейка по служебным словам»: пары, которые liveAbbrevMatch
// склеивает, а из общих слов >=3 только служебные (who/those/тех/кто...).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import * as m from './live-dupe-key.mjs';

const env = Object.fromEntries(readFileSync('.env', 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE);

const FUNC = new Set(['who', 'those', 'this', 'that', 'than', 'your', 'you', 'our', 'just', 'more', 'need', 'want',
  'your', 'there', 'here', 'they', 'them', 'what', 'when', 'where', 'have', 'has', 'will', 'would', 'can', 'could',
  'тех', 'кто', 'кому', 'чем', 'что', 'чтобы', 'себе', 'меня', 'вас', 'нас', 'если', 'тоже', 'очень', 'всех', 'всем']);

let rows = [];
for (let off = 0; ; off += 1000) {
  const { data, error } = await db.from('events').select('id,title,title_ru,title_en,status,city,start_date,start_time,address,lat,lng')
    .in('status', ['active', 'moderation']).range(off, off + 999);
  if (error) { console.log('ERR', error.message); break; }
  rows = rows.concat(data);
  if (data.length < 1000) break;
}
console.log('живых строк:', rows.length);
const byDay = new Map();
for (const r of rows) { const k = m.dayKey(r); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); }
let pairs = 0, funcOnly = 0;
const examples = [];
for (const list of byDay.values()) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const why = m.liveAbbrevMatch(list[i], list[j]) || m.liveDupeMatch(list[i], list[j]);
    if (!why) continue;
    pairs++;
    // общие слова по лучшей паре псевдонимов
    const best = { n: 0, words: [] };
    for (const k of ['title', 'title_ru', 'title_en']) for (const l of ['title', 'title_ru', 'title_en']) {
      const wa = m.abbrevWords(m.collapseAbbrev(list[i][k] || '')), wb = m.abbrevWords(m.collapseAbbrev(list[j][l] || ''));
      const c = wa.filter((w) => wb.includes(w));
      if (c.length > best.n) { best.n = c.length; best.words = c; }
    }
    const content = best.words.filter((w) => !FUNC.has(w));
    if (content.length < 3) {
      funcOnly++;
      examples.push([list[i].id.slice(0, 8), list[j].id.slice(0, 8), why, best.words.join(','), content.join(',') || '-',
        String(list[i].title).slice(0, 40), String(list[j].title).slice(0, 40)]);
    }
  }
}
console.log('пар склеено ключами:', pairs, '| из них без 3 содержательных слов:', funcOnly);
for (const e of examples.slice(0, 30)) console.log(' ', e.join(' | '));
