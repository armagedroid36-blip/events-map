// Правила автопроверки событий (без LLM): мат, запрещённые темы, обязательные поля.
// Быстрый и бесплатный первый фильтр перед LLM-судьёй (см. moderation-llm.mjs).
//
// Вердикт правил:
//   reject — грубое нарушение (мат, криминал, аморальное) → публиковать нельзя
//   review — сомнительно или не хватает обязательных данных → оставить человеку
//   pass   — возражений нет, передать в LLM-проверку
//
// Экспорт: checkRules(ev) -> { verdict, flags[], reason }

// --- Мат и оскорбления -------------------------------------------------------
// Корни, которые безопасно искать подстрокой: слова с такими началами — мат.
// ВАЖНО: проверять новые корни на всей базе (temp/rules-sweep.mjs), иначе
// ложные срабатывания бьют по нормальным событиям. Уже ловили:
//   «блят» → расслаБЛЯТься, углуБЛЯТь;  «ебат» → ДЕБАТы;  «манда» → МАНДАрин
const MAT_PREFIX = [
  // русский: только однозначные начала слов
  'хуй', 'хуя', 'хую', 'хуё', 'хуе', 'хуи', 'пизд', 'бляд', 'заеб', 'выеб',
  'уебищ', 'долбоеб', 'охуе', 'ахуе', 'нахуй', 'похуй', 'мудак', 'мудил',
  'гандон', 'гондон', 'залуп', 'шлюх', 'сучар', 'пидор', 'пидар', 'педик',
  'мраз', 'падл', 'гнид',
];

// Слова целиком (по границам слова): ловим только как отдельное слово,
// чтобы не поймать «дебаты», «углублять», «мандарин», «класс»
const MAT_WORD = [
  'сука', 'суки', 'бля', 'блят', 'блять', 'блядь', 'манда', 'хер',
  'шлюха', 'проститутка', 'ебать', 'ебаться', 'ебаный', 'ебаная', 'ебаные',
  'ебало', 'ебал', 'ебет', 'ебут', 'ебуч', 'ебану', 'ебище', 'наеб', 'отъеб',
  'въеб', 'уеб', 'епта',
];

// Мелкие оскорбления в индонезийском/английском — тоже мат
const MAT_EN = [
  'fuck', 'fucked', 'fucking', 'fucker', 'motherfuck', 'shit', 'bitch',
  'bitches', 'cunt', 'asshole', 'dickhead', 'bastard', 'whore', 'slut',
  'pussy', 'retard', 'nigger', 'nigga',
];

const MAT_ID = ['kontol', 'memek', 'ngentot', 'pepek', 'bangsat', 'goblok', 'tolol', 'anjing lu', 'babi lu'];

// --- Запрещённые темы --------------------------------------------------------
// re — регулярка, flag — метка, verdict — что делать, why — пояснение человеку.
const TOPIC_RULES = [
  {
    flag: 'adult',
    verdict: 'reject',
    why: 'контент 18+',
    // Возрастной рейтинг «18+» сам по себе НЕ нарушение (киноклуб, хоррор) —
    // ловим только явный взрослый контент.
    re: /\bxxx\b|эротич|erotic|adults?\s*only|18\s*\+\s*only|\bдля взрослых\b|эскорт|escort\s*(service|girl)|стриптиз|striptease|onlyfans|вебкам|webcam\s*(girl|model)|интим[- ]?услуг|секс[- ]?услуг|sex\s*club|soapland|nuru\s*massage|happy\s*ending|проститут/i,
  },
  {
    flag: 'drugs',
    verdict: 'reject',
    why: 'наркотики',
    re: /наркотик|мефедрон|амфетамин|кокаин|марихуан|закладк|mdma|cocaine|\bmeth\b|lsd\b|psychedelic\s*substance|drugs?\s*(for\s*sale|delivery)|shrooms?\s*for\s*sale|magic\s*mushroom\s*(delivery|shop)/i,
  },
  {
    flag: 'weapons',
    verdict: 'reject',
    why: 'оружие',
    re: /\bоружие\b|огнестрел|weapons?\s*for\s*sale|firearm|ammunition|\bammo\b|gun\s*(shop|sale)/i,
  },
  {
    flag: 'gambling',
    verdict: 'reject',
    why: 'азартные игры',
    re: /казино|\bcasino\b|casino\s*(bonus|online)|слоты\b|slot\s*machine|букмекер|betting\s*(site|bonus)|ставки на спорт|1xbet|pin-?up\s*casino|poker\s*tournament|покерный турнир/i,
  },
  {
    flag: 'scam',
    verdict: 'reject',
    why: 'признаки мошенничества',
    re: /пассивн[ыо][йм]\s*доход|гарантированн[ыа][йя]\s*(доход|прибыл)|удво(им|ить)\s*депозит|крипто[- ]?сигнал|forex\s*сигнал|бинарные опционы|финансовая пирамида|хайп[- ]?проект|инвестиц\w*\s*(от\s*)?\d+\s*%|заработок\s*от\s*\d+|быстрый\s*заработок/i,
  },
  {
    flag: 'illegal',
    verdict: 'reject',
    why: 'запрещённый законом контент',
    re: /продам\s*документ|купить\s*(диплом|паспорт|визу)|поддельн\w*\s*документ|подделка\s*документ|обнал\b|продаж[аи]\s*(базы|данных)|слив\s*базы/i,
  },
  {
    flag: 'hate',
    verdict: 'reject',
    why: 'вражда/экстремизм',
    re: /\b(наци|фашист|зыг|neonazi|nazi\s*(party|rally))\b|экстремист|призыв\w*\s*к\s*насили|сжигай|убивай/i,
  },
  {
    flag: 'politics',
    verdict: 'review',
    why: 'политическая тема',
    // «Протест» само по себе — не политика («организм протестует»): нужен
    // политический контекст. Протестировать/протестант тоже исключены.
    re: /(?<![\p{L}])(митинг\w*|предвыборн\w*|агитац\w*|пропаганд\w*|протестн\w*\s+акци\w*|протест\w*\s+против\s+(власт|правительств|режим)|политическ\w*\s+(партия|акция|митинг)|сект[аыуе]\b|религиозн\w*\s+проповед\w*)/iu,
  },
  {
    flag: 'spam',
    verdict: 'review',
    why: 'похоже на рекламу, а не событие',
    re: /подпишись|переходи по ссылке|жми на ссылку|промокод|скидк\w*\s*\d+\s*%|купи\s*(сейчас|сразу)|заказать\s*(сейчас|здесь)|розыгрыш\s*(денег|денежных)/i,
  },
];

/** Убрать экранирование и лишние пробелы для анализа */
function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function textOf(ev) {
  return {
    title: norm(ev.title_ru || ev.title_en || ev.title),
    desc: norm([ev.description_ru, ev.description_en, ev.description].filter(Boolean).join(' ')),
  };
}

/** Есть ли мат в строке; возвращает найденный корень или null */
function findProfanity(text) {
  const low = text.toLowerCase();
  if (!low) return null;
  for (const root of MAT_PREFIX) if (low.includes(root)) return root;
  // Слова целиком — по границам (кириллица/латиница как буквы)
  for (const w of [...MAT_WORD, ...MAT_EN, ...MAT_ID]) {
    const re = new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu');
    if (re.test(low)) return w;
  }
  return null;
}

/** Координаты пригодны для карты: числа, не нули, в допустимых пределах */
function hasValidCoords(ev) {
  const lat = Number(ev.lat);
  const lng = Number(ev.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Дата события: 'YYYY-MM-DD' или ISO; сравнение по календарному дню */
function parseDay(value) {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

function todayDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Проверить событие правилами.
 * @param {Record<string, any>} ev строка из таблицы events
 * @returns {{verdict: 'pass'|'review'|'reject', flags: string[], reason: string}}
 */
export function checkRules(ev) {
  const { title, desc } = textOf(ev);
  const flags = [];

  // 1. Мат. В названии — карточку не публикуем совсем. Только в описании —
  // отдаём человеку: там мат часто из названия фильма/пьесы («Сука-любовь»).
  const matTitle = findProfanity(title);
  if (matTitle) {
    return { verdict: 'reject', flags: ['profanity'], reason: `мат/оскорбления в названии (${matTitle})` };
  }
  const matDesc = findProfanity(desc);
  if (matDesc) {
    flags.push('profanity');
  }

  // 2. Запрещённые темы. В названии — отклоняем, только в описании — на проверку.
  let reviewReason = matDesc ? `мат/оскорбления в описании (${matDesc})` : '';
  for (const rule of TOPIC_RULES) {
    const inTitle = rule.re.test(title);
    const inDesc = !inTitle && rule.re.test(desc);
    if (!inTitle && !inDesc) continue;
    flags.push(rule.flag);
    if (rule.verdict === 'reject' && inTitle) {
      return { verdict: 'reject', flags, reason: rule.why };
    }
    if (!reviewReason) reviewReason = inTitle || rule.verdict === 'review' ? rule.why : `${rule.why} (в описании)`;
  }

  // 3. Обязательные поля: без них карточка не работает на карте
  const problems = [];
  if (title.length < 3) problems.push('нет названия');
  const day = parseDay(ev.start_date);
  if (!day) problems.push('нет даты');
  else if (day < todayDay()) problems.push('дата в прошлом');
  if (!norm(ev.city)) problems.push('нет города');
  if (!hasValidCoords(ev)) problems.push('нет координат');
  if (desc.length < 20 && !norm(ev.website)) problems.push('нет описания и ссылки');

  if (problems.length) {
    return { verdict: 'review', flags: [...flags, 'incomplete'], reason: problems.join(', ') };
  }
  if (reviewReason) {
    return { verdict: 'review', flags, reason: reviewReason };
  }
  return { verdict: 'pass', flags, reason: '' };
}

/** Текст карточки для LLM-судьи (обрезанный) */
export function eventTextForLlm(ev) {
  const { title, desc } = textOf(ev);
  return {
    title: title.slice(0, 200),
    description: desc.slice(0, 1200),
    city: norm(ev.city),
    address: norm(ev.address),
    category: norm(ev.category_id),
    website: norm(ev.website),
  };
}
