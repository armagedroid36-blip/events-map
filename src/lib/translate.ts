// Перевод контента событий (название/описание) на второй язык сайта.
// Выполняется ОДИН раз при сохранении события, результат хранится в базе.
//
// Как работает:
// - в рабочем режиме вызывается серверная функция Supabase (Edge Function),
//   которая обращается к DeepSeek API. Ключ перевода хранится в секретах
//   Supabase и никогда не попадает в браузер;
// - в демо-режиме (или при сбое) возвращается null — посетитель увидит
//   оригинальный текст, как предусмотрено спецификацией.
import { config } from '../config';

/**
 * Переводит текст на целевой язык.
 * @returns переведённый текст или null (перевод недоступен — показать оригинал)
 */
export async function translateText(text: string, targetLang: 'ru' | 'en'): Promise<string | null> {
  if (!text.trim() || config.demoMode) return null;

  try {
    // Вызов серверной функции перевода (разворачивается вместе с Supabase)
    const url = `${config.supabaseUrl}/functions/v1/translate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // В продакшене сюда подставляется анонимный ключ Supabase
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
      body: JSON.stringify({ text, target_lang: targetLang }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translated_text?: string };
    return data.translated_text ?? null;
  } catch {
    return null;
  }
}

/**
 * Определяет язык оригинала по тексту (эвристика).
 * Для MVP достаточно: если есть кириллица — русский, иначе — английский.
 */
export function detectLang(text: string): 'ru' | 'en' {
  return /[а-яё]/i.test(text) ? 'ru' : 'en';
}

/**
 * Возвращает текст события на языке интерфейса:
 * перевод, если есть; иначе оригинал (запасной вариант по спецификации).
 */
export function localizedText(
  original: string,
  ru?: string,
  en?: string,
  sourceLang?: string,
  uiLang: 'ru' | 'en' = 'ru',
): string {
  if (uiLang === 'ru') return ru || (sourceLang === 'ru' ? original : original);
  return en || (sourceLang === 'en' ? original : original);
}
