// Трекер посещений: публичная функция (без JWT), вызывается браузером при
// загрузке страницы. Определяет страну по IP посетителя (ip-api.com → fallback
// ipwho.is) и сохраняет ДВЕ агрегированные записи:
//   1) visits_country_daily — +1 визит страны (RPC increment_visit_country);
//   2) visits_source_daily  — +1 визит (страна, ИСТОЧНИК перехода, страница
//      входа) (RPC increment_visit_source) — с 21.09.2026, чтобы видеть «откуда
//      приходят посетители» (вопрос владельца: откуда переходы из Индонезии).
// Храним только: код страны, ДОМЕН источника (referrer без пути и query; пусто
// → 'direct', свой сайт → 'internal') и путь входа без query. IP-адреса, полные
// рефереры, query-параметры и user-agent НЕ сохраняются ни в каком виде.
// Кэш ip→country в памяти функции (TTL 24 ч) — чтобы не превышать лимит
// ip-api (45 req/min).
// env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (автоматически в Edge Functions).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// --- Кэш геолокации: ip -> { country, at } ---
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map<string, { country: string; at: number }>();

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

/** Страна по IP: ip-api.com → fallback ipwho.is. Ошибки/лимиты → 'unknown' */
async function countryByIp(ip: string): Promise<string> {
  const safe = encodeURIComponent(ip);
  try {
    const r = await fetch(`https://ip-api.com/json/${safe}?fields=status,countryCode`, {
      headers: { 'User-Agent': 'events-map-tracker/1.0' },
    });
    if (r.ok) {
      const j = (await r.json()) as { status?: string; countryCode?: string };
      if (j.status === 'success' && j.countryCode) return j.countryCode.toUpperCase();
    }
  } catch (e) {
    console.error('ip-api error:', String(e));
  }
  try {
    const r = await fetch(`https://ipwho.is/${safe}?fields=success,country_code`, {
      headers: { 'User-Agent': 'events-map-tracker/1.0' },
    });
    if (r.ok) {
      const j = (await r.json()) as { success?: boolean; country_code?: string };
      if (j.success && j.country_code) return j.country_code.toUpperCase();
    }
  } catch (e) {
    console.error('ipwho.is error:', String(e));
  }
  return 'unknown';
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

serve(async (req) => {
  // CORS preflight — сразу 204
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: CORS });
  }

  try {
    // Тело опционально (page_path/referrer). Сохраняем из него ТОЛЬКО домен
    // источника и путь входа — длину режем на входе, чтобы не тащить мусор в
    // базу (IP не логируется вовсе).
    let pagePath: unknown = null;
    let referrer: unknown = null;
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        pagePath = (body as { page_path?: unknown }).page_path ?? null;
        referrer = (body as { referrer?: unknown }).referrer ?? null;
      }
    } catch {
      /* пустое/не-JSON тело — не ошибка */
    }
    const source = sourceFromReferrer(referrer);
    const landing = pathFromPagePath(pagePath);

    const ip = clientIp(req);
    let country = 'unknown';
    if (ip) {
      pruneCache();
      const cached = geoCache.get(ip);
      if (cached) {
        country = cached.country;
      } else {
        country = await countryByIp(ip);
        geoCache.set(ip, { country, at: Date.now() });
      }
    }

    // Ошибка записи не должна ронять ответ — визит не критичен
    await incrementCountry(country).catch((e) => console.error('increment error:', String(e)));
    await incrementSource(country, source, landing).catch((e) =>
      console.error('increment source error:', String(e)),
    );
  } catch (e) {
    console.error('track_visit error:', String(e));
  }

  return new Response(null, { status: 204, headers: CORS });
});
