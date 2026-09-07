// Перевод названия/описания события на целевой язык (ru <-> en).
// Вызывается фронтендом при сохранении события и бэкфилл-скриптами:
//   POST {text: string, target_lang: 'ru'|'en'} -> {translated_text: string}
// Доступ: публичная (--no-verify-jwt), ключ DeepSeek живёт в секретах функции.
// env: DEEPSEEK_API_KEY
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || '';
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY подставляются в env функций
// автоматически — через них функция пишет счётчик rate limit в Postgres.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MODEL = 'deepseek-chat';

// Rate limit: 10 запросов/мин на IP — защита DeepSeek-бюджета (функция
// публичная). Счётчик — в Postgres (RPC translate_rate_check): in-memory
// ненадёжен — Supabase распределяет запросы по изолятам/инстансам.
const RATE_PER_MINUTE = 10;

/** true — запрос превысил лимит (10/мин), нужно ответить 429.
 *  Сбой счётчика (сеть/БД) НЕ блокирует перевод — fail open. */
async function isRateLimited(req: Request): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return false;
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/translate_rate_check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ p_ip: ip.slice(0, 64), p_max: RATE_PER_MINUTE }),
    });
    if (!r.ok) return false;
    const ok = await r.json();
    return ok === false;
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT =
  'Ты переводишь тексты афиш и событий (название или описание) с русского на ' +
  'английский или с английского на русский. Сохрани смысл, факты, даты, цены и ' +
  'стиль оригинала. Названия мест, имена и бренды транслитерируй (не переводи). ' +
  'Верни ТОЛЬКО переведённый текст без кавычек, комментариев и пояснений.';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders() });
  }
  try {
    // Rate limit до обработки тела (дёшево): 11-й запрос с IP за минуту — 429
    if (await isRateLimited(req)) {
      return new Response(JSON.stringify({ error: 'rate limit exceeded, try again later' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...corsHeaders() },
      });
    }
    const body = await req.json().catch(() => null);
    let text: unknown = body?.text;
    const targetLang: unknown = body?.target_lang;
    if (typeof text !== 'string' || !text.trim() || (targetLang !== 'ru' && targetLang !== 'en')) {
      return new Response(JSON.stringify({ error: 'text (string) and target_lang ("ru"|"en") are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    // Перф/бюджет: на перевод нужен только зачин текста; длинные описания
    // обрезаем молча (без ошибки) — max_tokens 2000 и так ограничивает вывод.
    const trimmedText = text.slice(0, 2000);
    if (!DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'translate is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

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
            content: `Переведи на ${langName} язык:\n\n${trimmedText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return new Response(JSON.stringify({ error: `deepseek ${res.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const data = await res.json();
    const translated: unknown = data?.choices?.[0]?.message?.content;
    if (typeof translated !== 'string' || !translated.trim()) {
      return new Response(JSON.stringify({ error: 'empty translation from provider' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ translated_text: translated.trim() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
