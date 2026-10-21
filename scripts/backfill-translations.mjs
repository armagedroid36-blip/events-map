// Backfill переводов событий (промпт R, п. 2.2): находит события активные и
// ждущие публикации (moderation, needs_changes), которым нужна вторая языковая
// версия, и заполняет её через service role. Возобновляемый: повторный запуск
// добивает оставшиеся (уже переведённые не трогает — идемпотентно).
//
// Четыре случая (язык оригинала определяется по письменности, а не по подсказке
// источника — агрегаторы отдают греческие афиши под флагом 'en'):
//   1) RU-версия нужна ВСЕГДА, когда оригинал не русский: английские афиши
//      (Кипр, Бали, Вьетнам) переводятся на RU так же, как греческие —
//      сборщики клали текст источника в RU-поля, и без перевода русская
//      страница показывала английский заголовок;
//   2) EN-версия нужна, когда английского поля нет или в нём битый текст:
//      русский оригинал → перевод, английский → копия оригинала (LLM не
//      вызывается), греческий → перевод;
//   3) греческий оригинал уходит и в RU, и в EN, ставим source_lang='el'.
//      Греческий в поля переводов не копируется;
//   4) греческий ЗАСТРЯЛ в полях перевода у события с английским оригиналом
//      (копия до фикса) → пересобираем обе версии, язык остаётся 'en'.
//
// Идемпотентность: после успешного перевода поле перестаёт быть копией
// оригинала. Исключение — названия из имён и брендов без переводимых слов
// («Oktoberfest 2026» → «Oktoberfest 2026»): их отмечаем в реестре
// scripts/data/i18n-done.json (ключ — отпечаток оригинального текста, поэтому
// правка события в БД снимает отметку сама).
//
// Что НЕ трогаем: rejected. Архивные страницы при этом ПУБЛИКУЮТСЯ (beta 0.67)
// и стоят в sitemap: при STATUSES=archived у архивной карточки чинятся ТОЛЬКО
// RU-поля (title_ru/description_ru), EN-поля и source_lang/language не
// пишутся вовсе — иначе дозаполнение title_en создало бы новые /en/-страницы,
// а смена source_lang сдвинула бы хвост RU-URL (src/lib/slug.ts eventSlug).
//
// Перевод: DeepSeek напрямую (DEEPSEEK_API_KEY, промпт — копия Edge Function
// translate) либо, если ключа нет, через Edge Function translate (anon-ключ —
// как фронтенд src/lib/translate.ts; лимит публичной функции 10 запросов/мин
// на IP — при 429 скрипт ждёт и повторяет).
//
// Результат проверяется на остаток чужого письма (кириллица/греческий) и при
// остатках повторяется со строгим промптом.
//
// env: LIMIT (по умолчанию 120) — максимум событий за запуск,
//      CONCURRENCY (2) — параллельных событий, PAUSE_MS (400) — пауза воркера,
//      DRY_RUN=1 — показать план без запросов к переводчику,
//      STATUSES=archived — разовая починка архива (по умолчанию
//      active,moderation,needs_changes — как в CI),
//      IDS=id1,id2 — точечная починка названных карточек (статус не важен,
//      архив тоже берётся: так чинят страницы прошедших событий).
//
// Запуск: source .env (SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE,
// VITE_SUPABASE_ANON_KEY, DEEPSEEK_API_KEY) && node scripts/backfill-translations.mjs
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectAll } from './db-rows.mjs';
import { clipText } from './text-safe.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
// anon-ключ фронтенда публичный; в CI может отсутствовать как secret —
// тогда для заголовка Authorization берём service role (Edge Function translate
// этот заголовок не проверяет, контракт вызова не меняется).
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SERVICE_ROLE;

const db = SUPABASE_URL && SERVICE_ROLE
  ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  : null;
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 120); // предохранитель токенов
// Какие статусы обрабатываем. По умолчанию — как в CI: активные и ждущие
// публикации. Архивные страницы ПУБЛИКУЮТСЯ (beta 0.67: страницы прошедших
// событий + sitemap), поэтому мусор в архиве видит и посетитель, и Google:
// разовая починка архива — STATUSES=archived. Из архива берутся только
// карточки с греческим (см. main) — остальная работа по архиву дозаполняет
// title_en и создаёт НОВЫЕ /en/-страницы, это отдельное решение владельца.
const STATUSES = (process.env.STATUSES || 'active,moderation,needs_changes')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Точечная починка названных карточек: статус и правила архива не действуют —
// id назвал человек. Нужна для страниц прошедших событий, которые открыты
// посетителю и стоят в sitemap.
const ONLY_IDS = new Set(
  (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
);
// Правка языка оригинала меняет ХВОСТ URL (src/lib/slug.ts eventSlug): после
// такого прогона обязательно node scripts/legacy-slug-urls.mjs ДО сборки.
const CONCURRENCY = Number(process.env.CONCURRENCY || 3); // параллельных переводов
const PAUSE_MS = Number(process.env.PAUSE_MS || 400); // пауза между событиями в воркере
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const HAS_CYRILLIC = /[а-яё]/i;
// Для гейта качества — только НАСТОЯЩИЕ русские слова: 2+ кириллических
// символа подряд или одиночная буква-слово. Одиночные кириллические
// «двойники» латинских букв внутри латинских слов/адресов (напр. «3Х Studio»,
// где Х — U+0425) перевод не ломают и повторных переводов не требуют.
const CYR_WORD = /[\u0400-\u04FF]{2,}|(?:^|\s)[\u0400-\u04FF](?=\s|$)/m;
// Греческий: ЛЮБАЯ буква — критерий приёмки (в переводах греческих букв быть
// не должно), «слово» — для повтора со строгим промптом.
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const GREEK_WORD = /[\u0370-\u03FF\u1F00-\u1FFF]{2,}|(?:^|\s)[\u0370-\u03FF\u1F00-\u1FFF](?=\s|$)/m;

/** Язык текста по письменности: греческий → 'el', кириллица → 'ru', иначе 'en' */
function detectLang(text) {
  const s = String(text || '');
  if (GREEK.test(s)) return 'el';
  if (HAS_CYRILLIC.test(s)) return 'ru';
  return 'en';
}

const str = (v) => String(v ?? '');

/** Хвост строгого промпта: целевой язык и запрет чужого письма в ответе */
function strictSuffix(target) {
  return target === 'ru'
    ? '\n\nВАЖНО: переведи ВСЁ на русский язык; в ответе не должно остаться ни ' +
        'одного ГРЕЧЕСКОГО символа — греческие названия и имена передай кириллицей.'
    : '\n\nВАЖНО: переведи ВСЁ на английский язык, в ответе не должно остаться ни ' +
        'одного кириллического или греческого символа: имена, бренды и названия ' +
        'мест — латиницей.';
}

/** Перевод через Edge Function translate (тот же контракт, что фронт) */
async function translateViaEdge(text, targetLang, _strict = false) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ text, target_lang: targetLang }),
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = await res.json();
  const out = typeof data?.translated_text === 'string' ? data.translated_text.trim() : '';
  if (!out) throw new Error('translate: пустой ответ');
  return out;
}

// --- Прямой вызов DeepSeek (основной путь, когда есть DEEPSEEK_API_KEY) ---
// Промпт и параметры — копия Edge Function translate (supabase/functions/
// translate/index.ts): публичная функция ограничена 10 запросами/мин на IP,
// поэтому бэкфилл сотен событий упирается в 429 и растягивается на часы.
// DEEPSEEK_API_KEY уже передаётся workflow для сборщиков.
const MODEL = 'deepseek-chat';
const MAX_INPUT_CHARS = 2000; // как в Edge Function
// Промпт язык-независимый: оригинал бывает русским, английским или греческим.
const SYSTEM_PROMPT =
  'Ты переводишь тексты афиш и событий (название или описание). Оригинал может ' +
  'быть на русском, английском или греческом языке — переведи его на указанный ' +
  'целевой язык. Сохрани смысл, факты, даты, цены и стиль оригинала. Названия ' +
  'мест, имена и бренды передавай латиницей (транслитерация, не перевод). ' +
  'Верни ТОЛЬКО переведённый текст без кавычек, комментариев и пояснений.';

async function translateViaDeepSeek(text, targetLang, strict = false) {
  const langName = targetLang === 'ru' ? 'русский' : 'английский';
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Переведи на ${langName} язык:\n\n${clipText(text, MAX_INPUT_CHARS)}` +
            (strict ? strictSuffix(targetLang) : ''),
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`deepseek ${res.status}: ${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const out = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';
  if (!out) throw new Error('deepseek: пустой ответ');
  return out;
}

/** Перевод: DeepSeek напрямую (если есть ключ), иначе Edge Function translate.
 *  429 (лимит публичной функции 10/мин на IP) и сетевые сбои — пауза и повтор. */
async function translate(text, targetLang, strict = false) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return DEEPSEEK_API_KEY
        ? await translateViaDeepSeek(text, targetLang, strict)
        : await translateViaEdge(text, targetLang, strict);
    } catch (err) {
      const msg = String(err?.message || err);
      if (attempt < 4 && /429/.test(msg)) {
        console.warn(`  ~ лимит перевода, пауза 62 с (попытка ${attempt}/3)`);
        await sleep(62000);
        continue;
      }
      // сетевые сбои (DeepSeek из RU-сети нестабилен) — короткий повтор
      if (attempt < 4 && /fetch failed|network|ECONN|ETIMEDOUT|socket|ENOTFOUND/i.test(msg)) {
        console.warn(`  ~ сеть: ${msg.slice(0, 60)} — повтор через 3 с (попытка ${attempt}/3)`);
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('translate: лимит запросов не снят');
}

// Двойники греческих букв латиницей — аварийная сетка, если модель упёрлась.
// Нужна потому, что в афишах встречается ОДНА греческая буква вместо похожей
// латинской («29 Αugust»), а критерий приёмки — ни одной греческой буквы.
const GREEK_TWINS = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'h', θ: 'th', ι: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'v', ξ: 'x', ο: 'o', π: 'p', ρ: 'p', ς: 's',
  σ: 's', τ: 't', υ: 'y', φ: 'f', χ: 'x', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o', ϊ: 'i', ϋ: 'y',
  ΐ: 'i', ΰ: 'y', Α: 'A', Β: 'B', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'H',
  Θ: 'Th', Ι: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P',
  Ρ: 'P', Σ: 'S', Τ: 'T', Υ: 'Y', Φ: 'F', Χ: 'X', Ψ: 'Ps', Ω: 'O',
  Ά: 'A', Έ: 'E', Ή: 'H', Ί: 'I', Ό: 'O', Ύ: 'Y', Ώ: 'O',
};

const greekToLatin = (s) =>
  String(s).replace(/[\u0370-\u03FF\u1F00-\u1FFF]/g, (ch) => GREEK_TWINS[ch] || '');

/** Перевод поля с проверкой письма: в EN-тексте не должно остаться кириллицы
 *  или греческого, в RU — греческого. При остатке — повтор со строгим
 *  промптом; в крайнем случае оставшиеся греческие буквы заменяются
 *  латинскими двойниками (перевод с мусором хуже, чем текст без греческих
 *  букв — критерий приёмки строгий). */
async function translateField(text, target) {
  const dirty = (s) => (target === 'en' ? CYR_WORD.test(s) || GREEK_WORD.test(s) : GREEK_WORD.test(s));
  let out = await translate(text, target);
  for (let i = 0; i < 2 && dirty(out); i += 1) {
    console.warn('  ~ в переводе осталось чужое письмо — повтор со строгим промптом');
    out = await translate(text, target, true);
  }
  if (GREEK.test(out)) {
    console.warn(`  ~ греческие буквы остались после повторов: ${out.slice(0, 60)}`);
    out = greekToLatin(out);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Итоговое значение поля локализации.
 *  @param src      — текст оригинала для перевода
 *  @param stored   — то, что уже лежит в поле (может быть копией оригинала)
 *  @param target   — 'ru' | 'en'
 *  @param force    — перезаписать даже похожее на готовое значение (копию
 *                    не-греческого оригинала нужно заменить переводом)
 *  @returns {Promise<string|null>}
 */
async function resolveField(src, stored, target, force = false) {
  const text = str(src).trim();
  const cur = str(stored).trim();
  if (!text) return cur || null;
  // готовое значение не перезаписываем: ни греческих букв, для EN — ещё и
  // кириллицы нет (битый перевод)
  const usable = cur && !GREEK.test(cur) && (target === 'en' ? !CYR_WORD.test(cur) : true);
  if (usable && !force) return cur;
  // оригинал уже на целевом языке и чистый — берём его как есть
  if (detectLang(text) === target && !GREEK.test(text)) return text;
  return translateField(text, target);
}

/** Поле локализации не годится как есть: пустое, с греческими буквами или
 *  битое (в EN-тексте осталась кириллица) */
function fieldDirty(v, target) {
  const s = str(v).trim();
  if (!s) return true;
  if (GREEK.test(s)) return true;
  return target === 'en' && CYR_WORD.test(s);
}

/** Копия оригинала: сборщик клал текст источника в RU-поля, поэтому у
 *  греческой/английской афиши там лежал не перевод, а тот же текст. */
const isCopyOfSource = (v, src) => {
  const s = str(v).trim();
  return s !== '' && s === str(src).trim();
};

/** Латиница без единой кириллической буквы: в RU-поле не перевод, а
 *  переписанный оригинал (в том числе с другой расстановкой пробелов, как
 *  «Argia ( Innervisions)» → «Argia (Innervisions)»). */
const latinWithoutCyrillic = (v) => {
  const s = str(v).trim();
  return s !== '' && !HAS_CYRILLIC.test(s) && /[A-Za-z]/.test(s);
};

// --- Реестр «переводить нечего» --------------------------------------------
// Названия из имён и брендов без переводимых слов («Oktoberfest 2026»)
// переводятся в самих себя: поле остаётся копией оригинала, и без отметки
// карточка уходила бы в LLM на каждом прогоне (ломает идемпотентность).
// DDL из скрипта и CI недоступен, поэтому отметка — файл в репозитории (как
// реестр алиасов scripts/data/alias-urls.json). Ключ отметки — отпечаток
// оригинального текста: правка события в БД меняет отпечаток, и отметка
// перестаёт действовать сама.
const I18N_DONE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'data', 'i18n-done.json');
const i18nDone = loadI18nDone();

function loadI18nDone() {
  try {
    const raw = JSON.parse(readFileSync(I18N_DONE_FILE, 'utf8'));
    return new Map(Object.entries(raw?.marks || {}));
  } catch {
    return new Map(); // файла ещё нет — первый прогон
  }
}

/** Отпечаток оригинального текста карточки (заголовок + описание) */
const sourceFingerprint = (ev) =>
  createHash('sha1')
    .update(`${str(ev.title).trim()}\n${str(ev.description).trim()}`)
    .digest('hex')
    .slice(0, 16);

/** Сохранить реестр. keepIds — id, которые ещё есть в выборке: отметки
 *  ушедших карточек вычищаем, иначе файл растёт мусором. */
function saveI18nDone(keepIds) {
  const marks = {};
  for (const [id, fp] of [...i18nDone].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
    if (keepIds && !keepIds.has(id)) continue;
    marks[id] = fp;
  }
  writeFileSync(
    I18N_DONE_FILE,
    `${JSON.stringify(
      {
        note:
          'Карточки, у которых перевод совпал с оригиналом (имена и бренды без переводимых ' +
          'слов). Ключ — отпечаток title+description; файл ведёт scripts/backfill-translations.mjs.',
        updated: new Date().toISOString().slice(0, 10),
        marks,
      },
      null,
      2,
    )}\n`,
  );
}

/** План перевода карточки; null — карточка в порядке, трогать не нужно
 *  (это и есть гарантия идемпотентности повторного прогона: после успешного
 *  прохода все поля заполнены и перевода не требуют).
 *  @returns {null | {
 *    titleRu: null | {src: string, force: boolean},
 *    descRu:  null | {src: string, force: boolean},
 *    titleEn: {src: string, force: boolean},
 *    descEn:  null | {src: string, force: boolean},
 *    sourceLang: 'ru'|'en'|'el',
 *    greek: boolean,
 *  }} */
function translationPlan(ev) {
  const title = str(ev.title).trim();
  const desc = str(ev.description).trim();
  const hasDesc = desc !== '';
  const titleLang = detectLang(title);
  const descLang = detectLang(desc);
  const greekSource = GREEK.test(title) || GREEK.test(desc);
  const greekStored = [ev.title_ru, ev.description_ru, ev.title_en, ev.description_en]
    .some((v) => GREEK.test(str(v)));
  // «греческий случай»: греческий в оригинале либо застрял в переводах
  const greek = greekSource || greekStored;
  // Отметка «переводить нечего» действует, только пока оригинал не изменился
  const done = i18nDone.get(ev.id) === sourceFingerprint(ev);

  // RU-версия нужна ВСЕГДА, когда оригинал не русский: копия оригинала в
  // RU-поле — не перевод (так писали сборщики), её заменяем. Исключение —
  // карточки из реестра: там переводить действительно нечего.
  const ruTitleCopy = isCopyOfSource(ev.title_ru, title);
  const ruDescCopy = isCopyOfSource(ev.description_ru, desc);
  const ruTitleBad =
    titleLang !== 'ru'
    && (fieldDirty(ev.title_ru, 'ru') || ruTitleCopy || latinWithoutCyrillic(ev.title_ru));
  const ruDescBad =
    hasDesc && descLang !== 'ru'
    && (fieldDirty(ev.description_ru, 'ru') || ruDescCopy || latinWithoutCyrillic(ev.description_ru));
  // Отметка снимает только случай «латиница осталась латиницей»; реально
  // пустое/греческое поле чинится всегда, даже при отметке.
  const ruTitleWork = ruTitleBad && !(done && !fieldDirty(ev.title_ru, 'ru'));
  const ruDescWork = ruDescBad && !(done && !fieldDirty(ev.description_ru, 'ru'));
  // EN-версия: пустое или битое поле. Для английского оригинала LLM не
  // вызывается — resolveField вернёт текст как есть (это и есть перевод).
  const enWork =
    fieldDirty(ev.title_en, 'en') || (hasDesc && fieldDirty(ev.description_en, 'en'));
  if (!ruTitleWork && !ruDescWork && !enWork) return null;

  // Язык оригинала: греческий — когда греческий ЗАГОЛОВОК (греческое описание
  // при английском заголовке оставляет прежний язык, иначе EN-страница теряет
  // признак английского источника); кириллица — русский. Латинский заголовок
  // язык НЕ переопределяет: у русских событий с латинским названием («BI-2 @
  // ETKO») исходный source_lang='ru' верен, и переворот на 'en' сломал бы
  // фолбэки localizedText/seo. Ставим 'en' только если язык не задан вовсе.
  const storedLang = str(ev.source_lang).trim();
  const sourceLang = titleLang === 'el'
    ? 'el'
    : titleLang === 'ru'
      ? 'ru'
      : (storedLang === 'ru' ? 'ru' : 'en');

  return {
    greek,
    // force — когда в поле лежит копия не-русского оригинала: готовый перевод
    // не перезаписываем (повторный прогон = 0 записей и 0 запросов).
    titleRu: ruTitleWork ? { src: title, force: ruTitleCopy } : null,
    descRu: ruDescWork ? { src: desc, force: ruDescCopy } : null,
    titleEn: { src: title, force: false },
    descEn: enWork && hasDesc ? { src: desc, force: false } : null,
    enWork,
    sourceLang,
  };
}

async function main() {
  if (!db) {
    console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE (VITE_SUPABASE_ANON_KEY опционален)');
    process.exit(1);
  }
  // PostgREST отдаёт максимум 1000 строк за запрос — читаем страницами,
  // иначе часть карточек с греческим текстом остаётся незамеченной.
  const rows = await selectAll(
    db,
    'events',
    'id, title, description, title_ru, description_ru, title_en, description_en, source_lang, language, status',
    // Переводим не только опубликованные, но и ждущие модерации/правок:
    // иначе одобренное событие попадает на сайт (и в следующий деплой) без
    // EN-версии до следующего запуска сбора. Архив — по STATUSES=archived,
    // и только карточки с греческим (см. фильтр ниже).
    { filter: (q) => (ONLY_IDS.size ? q.in('id', [...ONLY_IDS]) : q.in('status', STATUSES)) },
  );

  const planned = [];
  for (const ev of rows) {
    const plan = translationPlan(ev);
    if (!plan) continue;
    // Архив: обрабатываем ТОЛЬКО RU-поля (title_ru/description_ru). Архивные
    // страницы стоят в sitemap, и 437 из них показывали английское описание на
    // русской странице. EN-поля архива не трогаем вообще: дозаполнение title_en
    // создаёт НОВУЮ /en/-страницу (новый URL в sitemap), а source_lang меняет
    // хвост RU-URL (eventSlug строит его из title_ru). Поэтому карточка идёт в
    // план только при реальной работе по RU и помечается ruOnly.
    // При IDS=... правила архива не действуют: id назвал человек.
    if (!ONLY_IDS.size && ev.status === 'archived') {
      if (!plan.titleRu && !plan.descRu) continue;
      plan.ruOnly = true;
    }
    planned.push({ ev, plan });
  }
  const greekCount = planned.filter((p) => p.plan.greek).length;
  const ruCount = planned.filter((p) => p.plan.titleRu || p.plan.descRu).length;
  const enCount = planned.filter((p) => p.plan.enWork).length;
  const archivedCount = planned.filter((p) => p.plan.ruOnly).length;
  const batch = planned.slice(0, LIMIT);
  console.log(
    `Событий к переводу: ${planned.length} (RU-версия — ${ruCount}, EN-версия — ${enCount}, `
    + `из них с греческим ${greekCount}, архивных RU-only — ${archivedCount}); `
    + `обрабатываем ${batch.length} (LIMIT=${LIMIT})`,
  );
  if (!batch.length) {
    console.log('Готово: переведено 0, ошибок 0. Осталось в плане: 0');
    return;
  }
  if (DRY_RUN) {
    for (const { ev, plan } of batch) {
      const dir = [plan.titleRu || plan.descRu ? 'RU' : '', plan.enWork ? 'EN' : '']
        .filter(Boolean).join('+');
      console.log(`  [dry] ${dir} ${str(ev.title).slice(0, 60)} → ${plan.sourceLang}`);
    }
    console.log(`Готово (DRY_RUN): план на ${batch.length} карточек из ${planned.length}, записей 0`);
    return;
  }

  let ok = 0;
  let fail = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= batch.length) return;
      const { ev, plan } = batch[i];
      const srcTitle = str(ev.title).trim();
      const srcDesc = str(ev.description).trim();
      try {
        // RU-only (архив): собираем значения ТОЛЬКО для RU-полей, для EN
        // resolveField не вызывается вовсе — экономия запросов к LLM и
        // гарантия, что EN-поля/язык оригинала не меняются.
        const [titleRu, descRu, titleEn, descEn] = await Promise.all(
          plan.ruOnly
            ? [
                plan.titleRu ? resolveField(plan.titleRu.src, ev.title_ru, 'ru', plan.titleRu.force) : Promise.resolve(ev.title_ru ?? null),
                plan.descRu ? resolveField(plan.descRu.src, ev.description_ru, 'ru', plan.descRu.force) : Promise.resolve(ev.description_ru ?? null),
                Promise.resolve(ev.title_en ?? null),
                Promise.resolve(ev.description_en ?? null),
              ]
            : [
                plan.titleRu ? resolveField(plan.titleRu.src, ev.title_ru, 'ru', plan.titleRu.force) : Promise.resolve(ev.title_ru ?? null),
                plan.descRu ? resolveField(plan.descRu.src, ev.description_ru, 'ru', plan.descRu.force) : Promise.resolve(ev.description_ru ?? null),
                resolveField(plan.titleEn.src, ev.title_en, 'en', plan.titleEn.force),
                plan.descEn ? resolveField(plan.descEn.src, ev.description_en, 'en', plan.descEn.force) : Promise.resolve(ev.description_en ?? null),
              ],
        );
        // Пишем только реальные изменения — повторный прогон ничего не обновляет.
        const norm = (v) => {
          const s = str(v).trim();
          return s === '' ? null : s;
        };
        const upd = {};
        if (norm(titleRu) !== norm(ev.title_ru)) upd.title_ru = norm(titleRu);
        if (norm(descRu) !== norm(ev.description_ru)) upd.description_ru = norm(descRu);
        if (!plan.ruOnly) {
          if (norm(titleEn) !== norm(ev.title_en)) upd.title_en = norm(titleEn);
          if (norm(descEn) !== norm(ev.description_en)) upd.description_en = norm(descEn);
          if (norm(ev.source_lang) !== plan.sourceLang) upd.source_lang = plan.sourceLang;
          if (norm(ev.language) !== plan.sourceLang) upd.language = plan.sourceLang;
        }

        if (!Object.keys(upd).length) {
          ok += 1;
          console.log(`  = без изменений: ${srcTitle.slice(0, 55)}`);
        } else {
          const { error: uErr } = await db.from('events').update(upd).eq('id', ev.id);
          if (uErr) throw uErr;
          ok += 1;
          console.log(`  + ${srcTitle.slice(0, 55)} [${plan.sourceLang}]`);
        }
        // Отметка «переводить нечего»: источник латиницей, и ответ тоже без
        // единой кириллической буквы — значит переводить было нечего (имя или
        // бренд). Без отметки карточка снова придёт в план на следующем
        // прогоне и снова уйдёт в LLM.
        const nothingToTranslate =
          (Boolean(plan.titleRu) && detectLang(srcTitle) === 'en' && latinWithoutCyrillic(titleRu))
          || (Boolean(plan.descRu) && detectLang(srcDesc) === 'en' && latinWithoutCyrillic(descRu));
        if (nothingToTranslate) i18nDone.set(ev.id, sourceFingerprint(ev));
        else i18nDone.delete(ev.id);
      } catch (err) {
        fail += 1;
        console.error(`  ! ${srcTitle.slice(0, 45)}: ${err?.message || err}`);
        if (process.env.DEBUG_STACK === '1') console.error(err?.stack || '');
      }
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, batch.length)) }, worker),
  );
  // Реестр сохраняем всегда (даже при ошибках): отметки уже пройденных
  // карточек не должны теряться. Отметки карточек, ушедших из выборки, чистим —
  // но при точечном прогоне (IDS=...) выборка не полная, чистить нельзя.
  saveI18nDone(ONLY_IDS.size ? null : new Set(rows.map((r) => r.id)));
  console.log(
    `Готово: обработано ${ok}, ошибок ${fail}. Осталось в плане: ${Math.max(0, planned.length - ok)}; `
    + `реестр «переводить нечего»: ${i18nDone.size} карточек`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error('Критическая ошибка:', e.message);
    process.exit(1);
  });
}

export { translationPlan, detectLang, fieldDirty, isCopyOfSource, sourceFingerprint };
