// Трекер посещений по странам: публичная функция (без JWT), вызывается
// браузером при загрузке страницы. Определяет страну по IP посетителя
// (ip-api.com → fallback ipwho.is), сохраняет ТОЛЬКО код страны в
// visits_country_daily через RPC increment_visit_country (service role).
// IP нигде не сохраняется; кэш ip→country в памяти функции (TTL 24 ч),
// чтобы не превышать лимит ip-api (45 req/min).
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
    // Тело опционально (page_path/referrer) — только обрезаем до 500 символов;
    // данные не сохраняются, IP не логируется.
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        for (const k of ['page_path', 'referrer'] as const) {
          const v = body[k];
          if (typeof v === 'string' && v.length > 500) body[k] = v.slice(0, 500);
        }
      }
    } catch {
      /* пустое/не-JSON тело — не ошибка */
    }

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
  } catch (e) {
    console.error('track_visit error:', String(e));
  }

  return new Response(null, { status: 204, headers: CORS });
});
