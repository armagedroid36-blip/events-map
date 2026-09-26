// Backfill переводов событий (промпт R, п. 2.2): находит события активные и
// ждущие публикации (moderation, needs_changes), которым нужна вторая языковая
// версия, и заполняет её через service role. Возобновляемый: повторный запуск
// добивает оставшиеся (уже переведённые не трогает — идемпотентно).
//
// Три случая (язык оригинала определяется по письменности, а не по подсказке
// источника — агрегаторы отдают греческие афиши под флагом 'en'):
//   1) русский оригинал (source_lang='ru' или кириллица) → переводим на EN;
//   2) греческий оригинал (буквы U+0370–U+03FF, U+1F00–U+1FFF) → переводим и
//      на RU, и на EN, ставим source_lang/language='el'. Греческий в поля
//      переводов не копируется (иначе и RU-, и EN-страница показывают
//      греческую афишу), поэтому до перевода title_ru/description_ru пустые;
//   3) греческий ЗАСТРЯЛ в полях перевода у события с английским оригиналом
//      (копия до фикса) → пересобираем обе версии, язык остаётся 'en'.
// Архив/отклонённые не трогаем (на сайте не видны).
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
//      DRY_RUN=1 — показать план без запросов к переводчику.
//
// Запуск: source .env (SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE,
// VITE_SUPABASE_ANON_KEY, DEEPSEEK_API_KEY) && node scripts/backfill-translations.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
// anon-ключ фронтенда публичный; в CI может отсутствовать как secret —
// тогда для заголовка Authorization берём service role (Edge Function translate
// этот заголовок не проверяет, контракт вызова не меняется).
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE (VITE_SUPABASE_ANON_KEY опционален)');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 120); // предохранитель токенов
const CONCURRENCY = Number(process.env.CONCURRENCY || 3); // параллельных переводов
const PAUSE_MS = Number(process.env.PAUSE_MS || 400); // пауза между событиями в воркере
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const HAS_CYRILLIC = /[а-яё]/i;
// Кириллица для проверки КАЧЕСТВА перевода: любая кириллическая буква
// (в EN-тексте её быть не должно — критерий приёмки SEO).
const CYR = /[\u0400-\u04FF]/;
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
            `Переведи на ${langName} язык:\n\n${String(text).slice(0, MAX_INPUT_CHARS)}` +
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
  // русский оригинал: прежний контракт скрипта (RU → EN)
  const ruOrigin =
    ev.source_lang === 'ru' ||
    HAS_CYRILLIC.test(str(ev.title_ru) || title) ||
    CYR.test([ev.title_ru, ev.description_ru, title, desc].map(str).join('\n'));

  // Что реально требует работы (иначе карточку не берём — идемпотентность)
  const ruTitleWork =
    greek && titleLang !== 'ru' && (fieldDirty(ev.title_ru, 'ru') || isCopyOfSource(ev.title_ru, title));
  const ruDescWork =
    greek && hasDesc && descLang !== 'ru'
    && (fieldDirty(ev.description_ru, 'ru') || isCopyOfSource(ev.description_ru, desc));
  const enWork =
    fieldDirty(ev.title_en, 'en') || (hasDesc && fieldDirty(ev.description_en, 'en'));
  if (!ruTitleWork && !ruDescWork && !((greek || ruOrigin) && enWork)) return null;

  // Язык, который покажем посетителю как «оригинал»: греческий — только когда
  // греческий ЗАГОЛОВОК (греческое описание при английском заголовке оставляет
  // 'en', иначе EN-страница теряет признак английского источника).
  const sourceLang = titleLang === 'el'
    ? 'el'
    : titleLang === 'ru' || !greek
      ? 'ru'
      : (ev.source_lang === 'ru' ? 'ru' : 'en');

  return {
    greek,
    // force — только когда в поле лежит копия не-русского оригинала: готовый
    // перевод не перезаписываем (повторный прогон = 0 записей и 0 запросов).
    titleRu: ruTitleWork
      ? { src: title, force: isCopyOfSource(ev.title_ru, title) }
      : null,
    descRu: ruDescWork
      ? { src: desc, force: isCopyOfSource(ev.description_ru, desc) }
      : null,
    titleEn: { src: title, force: false },
    descEn: hasDesc ? { src: desc, force: false } : null,
    sourceLang,
  };
}

async function main() {
  // PostgREST отдаёт максимум 1000 строк за запрос — читаем страницами,
  // иначе часть карточек с греческим текстом остаётся незамеченной.
  const rows = await selectAll(
    db,
    'events',
    'id, title, description, title_ru, description_ru, title_en, description_en, source_lang, language',
    // Переводим не только опубликованные, но и ждущие модерации/правок:
    // иначе одобренное событие попадает на сайт (и в следующий деплой) без
    // EN-версии до следующего запуска сбора. Архив/отклонённые не трогаем.
    { filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']) },
  );

  const planned = [];
  for (const ev of rows) {
    const plan = translationPlan(ev);
    if (plan) planned.push({ ev, plan });
  }
  const greekCount = planned.filter((p) => p.plan.greek).length;
  const batch = planned.slice(0, LIMIT);
  console.log(
    `Событий к переводу: ${planned.length} (из них с греческим текстом ${greekCount}); `
    + `обрабатываем ${batch.length} (LIMIT=${LIMIT})`,
  );
  if (!batch.length) {
    console.log('Готово: переведено 0, ошибок 0. Осталось без EN: 0');
    return;
  }
  if (DRY_RUN) {
    for (const { ev, plan } of batch) {
      console.log(`  [dry] ${plan.greek ? 'греч.' : 'ru'} ${str(ev.title).slice(0, 60)} → ${plan.sourceLang}`);
    }
    console.log(`Готово (DRY_RUN): план на ${batch.length} карточек, записей 0`);
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
      try {
        const [titleRu, descRu, titleEn, descEn] = await Promise.all([
          plan.titleRu ? resolveField(plan.titleRu.src, ev.title_ru, 'ru', plan.titleRu.force) : Promise.resolve(ev.title_ru ?? null),
          plan.descRu ? resolveField(plan.descRu.src, ev.description_ru, 'ru', plan.descRu.force) : Promise.resolve(ev.description_ru ?? null),
          resolveField(plan.titleEn.src, ev.title_en, 'en', plan.titleEn.force),
          plan.descEn ? resolveField(plan.descEn.src, ev.description_en, 'en', plan.descEn.force) : Promise.resolve(ev.description_en ?? null),
        ]);
        // Пишем только реальные изменения — повторный прогон ничего не обновляет.
        const norm = (v) => {
          const s = str(v).trim();
          return s === '' ? null : s;
        };
        const upd = {};
        if (norm(titleRu) !== norm(ev.title_ru)) upd.title_ru = norm(titleRu);
        if (norm(descRu) !== norm(ev.description_ru)) upd.description_ru = norm(descRu);
        if (norm(titleEn) !== norm(ev.title_en)) upd.title_en = norm(titleEn);
        if (norm(descEn) !== norm(ev.description_en)) upd.description_en = norm(descEn);
        if (norm(ev.source_lang) !== plan.sourceLang) upd.source_lang = plan.sourceLang;
        if (norm(ev.language) !== plan.sourceLang) upd.language = plan.sourceLang;

        if (!Object.keys(upd).length) {
          ok += 1;
          console.log(`  = без изменений: ${srcTitle.slice(0, 55)}`);
        } else {
          const { error: uErr } = await db.from('events').update(upd).eq('id', ev.id);
          if (uErr) throw uErr;
          ok += 1;
          console.log(`  + ${srcTitle.slice(0, 55)} [${plan.sourceLang}]`);
        }
      } catch (err) {
        fail += 1;
        console.error(`  ! ${srcTitle.slice(0, 45)}: ${err.message}`);
      }
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, batch.length)) }, worker),
  );
  console.log(`Готово: переведено ${ok}, ошибок ${fail}. Осталось без EN: ${planned.length - ok}`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
