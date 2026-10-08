// Юнит проверки text-safe: обрезка не должна оставлять одиночный суррогат.
// Регресс: 08.10.2026 карточка 3e1b3531 — описание обрезалось slice(0,1200)
// ровно на эмодзи, DeepSeek отвечал HTTP 400 «unexpected end of hex escape».
import { clipText, wellFormedText, hasLoneSurrogate } from './text-safe.mjs';
import { eventTextForLlm } from './moderation-rules.mjs';
import { createClient } from '@supabase/supabase-js';

let ok = 0; let fail = 0;
function t(name, cond, extra = '') {
  if (cond) { ok++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name} ${extra}`); }
}

const emoji = 'игра 😈 сегодня';            // 😈 = U+D83D U+DE08
t('эмодзи внутри сохраняется', wellFormedText(emoji) === emoji);
t('вырезает одиночный старший суррогат', wellFormedText('х\uD83D') === 'х');
t('вырезает одиночный младший суррогат', wellFormedText('х\uDE08') === 'х');
t('hasLoneSurrogate ловит', hasLoneSurrogate('х\uD83D') === true);
t('hasLoneSurrogate не лжёт', hasLoneSurrogate(emoji) === false);

// обрезка ровно между суррогатами
const src = 'a'.repeat(1199) + '😈' + 'b'.repeat(20);   // позиции 1199 (старший), 1200 (младший)
const oldWay = src.slice(0, 1200);
t('старый slice(0,1200) рождает одиночный суррогат', hasLoneSurrogate(oldWay) === true);
const cut = clipText(src, 1200);
t('clipText не рождает одиночный суррогат', hasLoneSurrogate(cut) === false, JSON.stringify(cut.slice(-3)));
t('clipText не длиннее лимита', cut.length <= 1200);
t('clipText режет только полноценные пары (эмодзи выброшена целиком)', cut === 'a'.repeat(1199));
t('clipText короткий текст не меняет', clipText('короткий текст 😈', 1200) === 'короткий текст 😈');
t('clipText(0) безопасен', clipText('текст', 0) === '');

// карточка из базы (если есть ключи): суррогатов в тексте для LLM быть не должно
if (process.env.SUPABASE_SERVICE_ROLE && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
  const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
  const { data, error } = await db.from('events')
    .select('id,title,title_ru,title_en,description,description_ru,description_en,city,address,category_id,website')
    .eq('status', 'moderation').limit(50);
  if (error) console.log('база недоступна:', error.message);
  else {
    let bad = 0;
    for (const ev of data || []) {
      const c = eventTextForLlm(ev);
      for (const f of ['title', 'description', 'city', 'address', 'website']) {
        if (hasLoneSurrogate(c[f] || '')) { bad++; console.log('  суррогат:', ev.id.slice(0, 8), f); }
      }
    }
    t(`текст ${(data || []).length} живых карточек moderation без одиночных суррогатов`, bad === 0, `плохих ${bad}`);
  }
}

console.log(`\n${ok}/${ok + fail} OK`);
process.exit(fail ? 1 : 0);
