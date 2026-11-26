// Трекер посещений: публичная функция (без JWT), вызывается браузером при
// загрузке страницы. Определяет страну по IP посетителя (ipwho.is →
// fallback ip-api) и сохраняет ТРИ агрегированные записи:
//   1) visits_country_daily — +1 визит страны (RPC increment_visit_country);
//   2) visits_source_daily  — +1 визит (страна, ИСТОЧНИК перехода, страница
//      входа) (RPC increment_visit_source) — с 21.09.2026, чтобы видеть «откуда
//      приходят посетители» (вопрос владельца: откуда переходы из Индонезии);
//   3) visits_quality_daily — +1 визит (страна, часовой пояс браузера, язык,
//      ASN/провайдер, вердикт user/suspect_vpn/bot) — с 26.11.2026, чтобы
//      отличать заходы через VPN от реальных посетителей.
// Храним только: код страны, ДОМЕН источника (referrer без пути и query; пусто
// → 'direct', свой сайт → 'internal'), путь входа без query, часовой пояс,
// две буквы языка, номер ASN, имя провайдера и вердикт. IP-адреса, полные
// рефереры, query-параметры и user-agent НЕ сохраняются ни в каком виде.
// Кэш ip→гео в памяти функции (TTL 24 ч) — чтобы не превышать лимиты
// бесплатных гео-API.
// env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (автоматически в Edge Functions).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// --- Кэш геолокации: ip -> { country, asn, provider, at } ---
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface GeoInfo {
  country: string;
  asn: number;
  provider: string;
}

const geoCache = new Map<string, { geo: GeoInfo; at: number }>();

// Часовой пояс браузера -> страна (ISO-2). Не полный справочник IANA, а
// покрытие реальных зон аудитории: РФ/СНГ, Европа, Азия, Америка, Океания.
// Нет зоны в списке -> пустая строка, и мы не делаем выводов по поясу.
const TZ_COUNTRY: Record<string, string> = Object.fromEntries(
  (
    'Europe/Moscow:RU,Europe/Kaliningrad:RU,Europe/Samara:RU,Europe/Volgograd:RU,' +
    'Europe/Ulyanovsk:RU,Europe/Astrakhan:RU,Europe/Saratov:RU,Europe/Kirov:RU,' +
    'Asia/Yekaterinburg:RU,Asia/Omsk:RU,Asia/Novosibirsk:RU,Asia/Barnaul:RU,' +
    'Asia/Tomsk:RU,Asia/Novokuznetsk:RU,Asia/Krasnoyarsk:RU,Asia/Irkutsk:RU,' +
    'Asia/Chita:RU,Asia/Yakutsk:RU,Asia/Khandyga:RU,Asia/Vladivostok:RU,' +
    'Asia/Ust-Nera:RU,Asia/Magadan:RU,Asia/Sakhalin:RU,Asia/Srednekolymsk:RU,' +
    'Asia/Kamchatka:RU,Asia/Anadyr:RU,Europe/Minsk:BY,Europe/Kyiv:UA,' +
    'Europe/Kiev:UA,Europe/Uzhgorod:UA,Europe/Zaporozhye:UA,Europe/Simferopol:UA,' +
    'Europe/Chisinau:MD,Europe/Tiraspol:MD,Asia/Almaty:KZ,Asia/Aqtobe:KZ,' +
    'Asia/Atyrau:KZ,Asia/Oral:KZ,Asia/Qostanay:KZ,Asia/Qyzylorda:KZ,' +
    'Asia/Aqtau:KZ,Asia/Tashkent:UZ,Asia/Samarkand:UZ,Asia/Bishkek:KG,' +
    'Asia/Dushanbe:TJ,Asia/Ashgabat:TM,Asia/Baku:AZ,Asia/Yerevan:AM,' +
    'Asia/Tbilisi:GE,Asia/Jakarta:ID,Asia/Makassar:ID,Asia/Jayapura:ID,' +
    'Asia/Pontianak:ID,Asia/Ho_Chi_Minh:VN,Asia/Bangkok:TH,Asia/Phnom_Penh:KH,' +
    'Asia/Vientiane:LA,Asia/Yangon:MM,Asia/Kuala_Lumpur:MY,Asia/Singapore:SG,' +
    'Asia/Manila:PH,Asia/Hong_Kong:HK,Asia/Shanghai:CN,Asia/Urumqi:CN,' +
    'Asia/Taipei:TW,Asia/Tokyo:JP,Asia/Seoul:KR,Asia/Kolkata:IN,' +
    'Asia/Calcutta:IN,Asia/Kathmandu:NP,Asia/Colombo:LK,Asia/Dhaka:BD,' +
    'Asia/Karachi:PK,Asia/Kabul:AF,Asia/Tehran:IR,Asia/Dubai:AE,' +
    'Asia/Muscat:OM,Asia/Riyadh:SA,Asia/Qatar:QA,Asia/Kuwait:KW,' +
    'Asia/Bahrain:BH,Asia/Jerusalem:IL,Asia/Tel_Aviv:IL,Asia/Beirut:LB,' +
    'Asia/Amman:JO,Asia/Baghdad:IQ,Europe/Istanbul:TR,Asia/Istanbul:TR,' +
    'Europe/London:GB,Europe/Dublin:IE,Europe/Lisbon:PT,Europe/Madrid:ES,' +
    'Europe/Paris:FR,Europe/Berlin:DE,Europe/Amsterdam:NL,Europe/Brussels:BE,' +
    'Europe/Zurich:CH,Europe/Vienna:AT,Europe/Prague:CZ,Europe/Warsaw:PL,' +
    'Europe/Budapest:HU,Europe/Bucharest:RO,Europe/Sofia:BG,Europe/Belgrade:RS,' +
    'Europe/Zagreb:HR,Europe/Ljubljana:SI,Europe/Bratislava:SK,Europe/Athens:GR,' +
    'Europe/Helsinki:FI,Europe/Stockholm:SE,Europe/Oslo:NO,Europe/Copenhagen:DK,' +
    'Europe/Riga:LV,Europe/Vilnius:LT,Europe/Tallinn:EE,Europe/Malta:MT,' +
    'Europe/Nicosia:CY,Europe/Luxembourg:LU,Europe/Monaco:MC,Europe/Andorra:AD,' +
    'America/New_York:US,America/Chicago:US,America/Denver:US,' +
    'America/Phoenix:US,America/Los_Angeles:US,America/Anchorage:US,' +
    'Pacific/Honolulu:US,America/Toronto:CA,America/Vancouver:CA,' +
    'America/Edmonton:CA,America/Winnipeg:CA,America/Halifax:CA,' +
    'America/Mexico_City:MX,America/Cancun:MX,America/Bogota:CO,' +
    'America/Lima:PE,America/Santiago:CL,America/Argentina/Buenos_Aires:AR,' +
    'America/Sao_Paulo:BR,America/Caracas:VE,America/Panama:PA,' +
    'Australia/Sydney:AU,Australia/Melbourne:AU,Australia/Brisbane:AU,' +
    'Australia/Perth:AU,Australia/Adelaide:AU,Australia/Darwin:AU,' +
    'Pacific/Auckland:NZ,Africa/Cairo:EG,Africa/Johannesburg:ZA,' +
    'Africa/Nairobi:KE,Africa/Casablanca:MA,Africa/Tunis:TN,Africa/Algiers:DZ'
  )
    .split(',')
    .map((pair) => pair.split(':') as [string, string]),
);

// Признаки хостинга/VPN по имени организации провайдера (ASN-org).
// Список — не «чёрный список VPN», а типовые датацентры, откуда выходят
// туннели. Ложные срабатывания возможны (Cloudflare WARP, корпоративные
// сети) — поэтому вердикт в админке подписан как «подозрение».
const HOSTING_RE =
  /(m247|datacamp|nordvpn|surfshark|expressvpn|private internet|proton|digitalocean|hetzner|ovh|contabo|linode|vultr|choopa|leaseweb|amazon|google llc|microsoft|oracle|cloudflare|akamai|scaleway|gcore|aeza|timeweb|selectel|beget|vdsina|hosting|datacenter|data center|vpn|colo|serverius|worldstream|psychz|quadranet|hostkey|ionos|hostwinds|kamatera|upcloud|netcup|mchost|firstvds|ihor|reg\.ru)/i;

const BOT_RE =
  /(bot|crawl|spider|slurp|headless|phantom|puppeteer|lighthouse|pagespeed|facebookexternalhit|bingpreview|yandex|semrush|ahrefs|mj12|petalbot|bytespider|gptbot|claudebot|ccbot)/i;

/** Страна языка браузера: 'ru-RU' -> 'RU'; мусор -> '' */
function langCountry(lang: string): string {
  const m = /^([a-z]{2})/i.exec(lang.trim());
  return m ? m[1].toUpperCase() : '';
}

/** Вердикт: user | suspect_vpn | bot. Оценка, не доказательство. */
function classifyVisit(
  ua: string,
  ipCountry: string,
  tz: string,
  lang: string,
  provider: string,
): string {
  if (BOT_RE.test(ua)) return 'bot';
  if (HOSTING_RE.test(provider)) return 'suspect_vpn';
  const tzC = TZ_COUNTRY[tz] ?? '';
  const langC = langCountry(lang);
  // Пояс «домашней» страны при IP из другой страны — типовой след VPN:
  // IP в Индонезии, часы и язык — Россия. Русский турист в Бали с местным
  // поясом (Asia/Makassar) под это не попадает и остаётся 'user'.
  if (tzC && ipCountry !== 'unknown' && tzC !== ipCountry && (!langC || langC === tzC)) {
    return 'suspect_vpn';
  }
  return 'user';
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Убрать из кэша просроченные записи */
function pruneCache(): void {
  const now = Date.now();
  for (const [ip, entry] of geoCache) {
    if (now - entry.at > CACHE_TTL_MS) geoCache.delete(ip);
  }
}

/** IP клиента: первый элемент x-forwarded-for (supabase edge runs). Пусто → null */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (!fwd) return null;
  const first = fwd.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/** Гео по IP: ipwho.is (страна + ASN + организация одним запросом), при
 *  сбое — ip-api (только страна). Ошибки/лимиты → 'unknown' без ASN. */
async function geoByIp(ip: string): Promise<GeoInfo> {
  const safe = encodeURIComponent(ip);
  try {
    const r = await fetch(
      `https://ipwho.is/${safe}?fields=success,country_code,connection`,
      { headers: { 'User-Agent': 'events-map-tracker/1.1' } },
    );
    if (r.ok) {
      const j = (await r.json()) as {
        success?: boolean;
        country_code?: string;
        connection?: { asn?: number; org?: string; isp?: string };
      };
      if (j.success && j.country_code) {
        return {
          country: j.country_code.toUpperCase(),
          asn: Number(j.connection?.asn) || 0,
          provider: String(j.connection?.org ?? j.connection?.isp ?? '').trim(),
        };
      }
    }
  } catch (e) {
    console.error('ipwho.is error:', String(e));
  }
  try {
    const r = await fetch(
      `https://ip-api.com/json/${safe}?fields=status,countryCode,org,as`,
      { headers: { 'User-Agent': 'events-map-tracker/1.1' } },
    );
    if (r.ok) {
      const j = (await r.json()) as {
        status?: string;
        countryCode?: string;
        org?: string;
        as?: string;
      };
      if (j.status === 'success' && j.countryCode) {
        const asn = Number(/AS(\d+)/.exec(j.as ?? '')?.[1]) || 0;
        return {
          country: j.countryCode.toUpperCase(),
          asn,
          provider: String(j.org ?? '').trim(),
        };
      }
    }
  } catch (e) {
    console.error('ip-api error:', String(e));
  }
  return { country: 'unknown', asn: 0, provider: '' };
}

/** Домен источника из referrer: только хост, без www, без пути и query.
 *  Пусто → 'direct'; свой сайт (переход внутри сайта) → 'internal'. */
const OWN_HOSTS = ['mypins.site', 'armagedroid36-blip.github.io', 'www.mypins.site'];

function sourceFromReferrer(referrer: unknown): string {
  if (typeof referrer !== 'string' || referrer.length === 0) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return 'direct';
    if (OWN_HOSTS.some((h) => h.replace(/^www\./, '') === host)) return 'internal';
    return host.slice(0, 120);
  } catch {
    return 'direct';
  }
}

/** Путь входа: pathname без query и hash (hash-маршруты приватных разделов
 *  дают '/'), пусто → '/'. */
function pathFromPagePath(pagePath: unknown): string {
  if (typeof pagePath !== 'string' || pagePath.length === 0) return '/';
  const clean = pagePath.split('#')[0].split('?')[0].trim();
  if (!clean) return '/';
  return (clean.startsWith('/') ? clean : `/${clean}`).slice(0, 200);
}

/** +1 визит источника (RPC increment_visit_source, service role) */
async function incrementSource(country: string, source: string, path: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_visit_source`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ p_country: country, p_source: source, p_path: path }),
  });
}

/** +1 визит страны за сегодня (RPC increment_visit_country, service role) */
async function incrementCountry(country: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_visit_country`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ p_country: country }),
  });
}

/** +1 визит в агрегат качества трафика (RPC increment_visit_quality).
 *  Пишем только нормализованные значения: страна, часовой пояс, язык,
 *  ASN, провайдер и вердикт. IP и user-agent не передаются. */
async function incrementQuality(
  country: string,
  tz: string,
  lang: string,
  asn: number,
  provider: string,
  verdict: string,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_visit_quality`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      p_country: country,
      p_tz: tz,
      p_lang: lang,
      p_asn: asn,
      p_provider: provider,
      p_verdict: verdict,
    }),
  });
}

serve(async (req) => {
  // CORS preflight — сразу 204
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: CORS });
  }

  try {
    // Тело опционально (page_path/referrer/tz/lang). Сохраняем из него ТОЛЬКО
    // домен источника, путь входа, часовой пояс и язык — длину режем на входе,
    // чтобы не тащить мусор в базу (IP не логируется вовсе).
    let pagePath: unknown = null;
    let referrer: unknown = null;
    let tz: unknown = null;
    let lang: unknown = null;
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        pagePath = (body as { page_path?: unknown }).page_path ?? null;
        referrer = (body as { referrer?: unknown }).referrer ?? null;
        tz = (body as { tz?: unknown }).tz ?? null;
        lang = (body as { lang?: unknown }).lang ?? null;
      }
    } catch {
      /* пустое/не-JSON тело — не ошибка */
    }
    const source = sourceFromReferrer(referrer);
    const landing = pathFromPagePath(pagePath);
    const tzValue = typeof tz === 'string' ? tz.trim().slice(0, 64) : 'unknown';
    const langValue = typeof lang === 'string' ? lang.trim().toLowerCase().slice(0, 5) : 'unknown';

    const ip = clientIp(req);
    let geo: GeoInfo = { country: 'unknown', asn: 0, provider: '' };
    if (ip) {
      pruneCache();
      const cached = geoCache.get(ip);
      if (cached) {
        geo = cached.geo;
      } else {
        geo = await geoByIp(ip);
        geoCache.set(ip, { geo, at: Date.now() });
      }
    }
    const country = geo.country;
    const ua = req.headers.get('user-agent') ?? '';
    const verdict = classifyVisit(ua, country, tzValue, langValue, geo.provider);

    // Ошибка записи не должна ронять ответ — визит не критичен
    await incrementCountry(country).catch((e) => console.error('increment error:', String(e)));
    await incrementSource(country, source, landing).catch((e) =>
      console.error('increment source error:', String(e)),
    );
    await incrementQuality(
      country,
      tzValue,
      langValue,
      geo.asn,
      geo.provider,
      verdict,
    ).catch((e) => console.error('increment quality error:', String(e)));
  } catch (e) {
    console.error('track_visit error:', String(e));
  }

  return new Response(null, { status: 204, headers: CORS });
});
