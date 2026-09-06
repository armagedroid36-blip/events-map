// Перевод названия/описания события на целевой язык (ru <-> en).
// Вызывается фронтендом при сохранении события и бэкфилл-скриптами:
//   POST {text: string, target_lang: 'ru'|'en'} -> {translated_text: string}
// Доступ: публичная (--no-verify-jwt), ключ DeepSeek живёт в секретах функции.
// env: DEEPSEEK_API_KEY
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || '';
const MODEL = 'deepseek-chat';

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
    const body = await req.json().catch(() => null);
    const text: unknown = body?.text;
    const targetLang: unknown = body?.target_lang;
    if (typeof text !== 'string' || !text.trim() || (targetLang !== 'ru' && targetLang !== 'en')) {
      return new Response(JSON.stringify({ error: 'text (string) and target_lang ("ru"|"en") are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
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
            content: `Переведи на ${langName} язык:\n\n${text}`,
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
