// Точка «События»: размер класса «wellness/эзотерика/псевдомедицина» — только чтение.
// Зачем: LLM-судья уводит такие карточки человеку (вердикт review), и вопрос владельцу
// «что с этим классом делать» должен опираться на цифру, а не на 4 карточки очереди.
// Usage: node --env-file=.env scripts/dot-wellness-class-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// Корни, по которым судья видит «псевдомедицину/эзотерику». Пишем основами, без \b/\w
// (в JS они не матчат кириллицу).
const KW = [
  'йог', 'цигун', 'qigong', 'тайцзи', 'тай-цзи', 'ушу',
  'рейки', 'reiki', 'медитац', 'дыхан', 'пранаям', 'mindful',
  'астролог', 'натальн', 'гороскоп', 'таро', 'хиромант', 'нумеролог',
  'гвозд', 'гвоздетер', 'лила', 'чакр', 'энергет', 'биоэнерг', 'аура', 'аурой', 'аурическ',
  'целит', 'исцел', 'healing', 'wellness', 'оздоров', 'детокс', 'квантов',
  'шаман', 'ритуал', 'тантр', 'медиум', 'ясновид', 'астр',
];
const RE = new RegExp(KW.join('|'), 'i');

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,title_en,start_date,city,source_type,website,auto_review');
const hay = r => [r.title, r.title_ru, r.title_en].filter(Boolean).join(' | ');
const hit = rows.filter(r => RE.test(hay(r)));
const by = s => hit.filter(r => r.status === s).length;
const live = hit.filter(r => ['active', 'moderation', 'needs_changes'].includes(r.status));
const verdict = r => {
  const ar = r.auto_review || {};
  return ar.verdict || ar.decision || ar.status || '(нет)';
};

console.log('ВСЕГО строк', rows.length, '| класс «wellness/эзотерика»', hit.length);
console.log('по статусам: active', by('active'), '| moderation', by('moderation'),
  '| needs_changes', by('needs_changes'), '| rejected', by('rejected'), '| archived', by('archived'));
const q = hit.filter(r => ['moderation', 'needs_changes'].includes(r.status));
console.log('живых в очереди (moderation+needs_changes):', q.length, '| из них review-вердикт:',
  q.filter(r => verdict(r) === 'review' || verdict(r) === 'review_human').length);
console.log('живых всего в классе (active+moderation+needs_changes):', live.length, '— из них active уже опубликовано:',
  live.filter(r => r.status === 'active').length);
console.log('\n-- карточки класса (до 20, свежие сверху) --');
for (const r of live.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')).slice(0, 20)) {
  console.log(r.id.slice(0, 8), r.status, r.start_date || '—', '|', (r.city || '—').slice(0, 22), '|',
    (r.title_ru || r.title || '').slice(0, 60), '|', ('сайт ' + (r.website ? 'есть' : 'нет')), '| вердикт', verdict(r));
}
console.log('\nПриёмка: живая карточка класса в active = уже прошла проверку человеком/судьёй;');
console.log('в moderation/needs_changes = ждёт решения владельца (класс не должен расти бесконечно).');
console.log('Питфол: число класса — ВЕРХНЯЯ оценка по корням, ложные попадания возможны');
console.log('(«ритуал» ловит «Пивоваренный ритуал», «дыхан» — «дыхательные практики» вне wellness):');
console.log('для решения владельца смотреть на колонку вердикта, а не на общее число.');
