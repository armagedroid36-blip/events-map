// План правки: архивные карточки с греческим текстом (заголовок греческий или
// греческий застрял в полях перевода). Считаем ПРЕЖНИЕ URL (то, что отдаёт прод
// сейчас) — их после правки нужно проверить как страницы-алиасы.
// Запуск: node scripts/dot-greek-fix-plan.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { eventSlug, eventHasEn } from '../src/lib/slug.ts';

const rows = JSON.parse(readFileSync('scripts/data/dot-class-probe.json', 'utf8'));
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const detectLang = (t) => {
  const s = String(t || '');
  if (!s.trim()) return '';
  if (GREEK.test(s)) return 'el';
  if (/[\u0400-\u04FF]/.test(s)) return 'ru';
  if (/[a-z]/i.test(s)) return 'en';
  return 'other';
};

const affected = rows.filter(
  (e) =>
    e.status === 'archived' &&
    (GREEK.test(String(e.title || '')) ||
      [e.title_ru, e.title_en, e.description_ru, e.description_en].some((v) => GREEK.test(String(v || '')))),
);

const SITE = 'https://mypins.site';
const plan = affected.map((e) => {
  const ruBefore = `${SITE}/event/${e.id}/${eventSlug(e, 'ru')}/`;
  const enBefore = eventHasEn(e) ? `${SITE}/en/event/${e.id}/${eventSlug(e, 'en')}/` : null;
  const titleLang = detectLang(e.title);
  return {
    id: e.id,
    start: e.start_date,
    titleLang,
    sourceLangBefore: e.source_lang,
    sourceLangAfter: titleLang === 'el' ? 'el' : e.source_lang === 'ru' ? 'ru' : 'en',
    title: String(e.title).slice(0, 60),
    titleEnEmpty: !e.title_en,
    ruBefore,
    enBefore,
  };
});

const outPath = process.argv[2] || 'scripts/data/dot-greek-fix-plan.json';
writeFileSync(outPath, JSON.stringify(plan, null, 1));
console.log(`Затронуто архивных карточек: ${plan.length}`);
console.log(`source_lang до → после: ${JSON.stringify(plan.reduce((m, p) => ((m[`${p.sourceLangBefore}->${p.sourceLangAfter}`] = (m[`${p.sourceLangBefore}->${p.sourceLangAfter}`] || 0) + 1), m), {}))}`);
for (const p of plan) {
  console.log(`  [${p.start}] ${p.sourceLangBefore}->${p.sourceLangAfter} tl=${p.titleLang} en_empty=${p.titleEnEmpty} ${p.id.slice(0, 8)} ${p.title}`);
  console.log(`      RU было: ${p.ruBefore}`);
  if (p.enBefore) console.log(`      EN было: ${p.enBefore}`);
}
