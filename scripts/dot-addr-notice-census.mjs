// Перепись класса «адрес = служебная заметка поста» (Важно:/Внимание:/NB: и т.п.)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,status,source_type,website');
const live = all.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
// кандидаты: начинается со служебного слова-заметки или содержит «не является»
const NOTICE = /^(?:важно|внимание|примечание|note|nb|обратите\s+внимание)\s*[:.—-]/i;
const OTHER = /не\s+является\s+(?:личной|медицинской|публичной)|вход\s+строго|оплата\s+(?:на\s+месте|по)/i;
const hits = live.filter((r) => r.address && (NOTICE.test(r.address) || OTHER.test(r.address)));
console.log(`живых ${live.length}; кандидатов ${hits.length}`);
for (const r of hits) console.log([r.id.slice(0, 8), r.status, r.city, (r.title_ru || r.title || '').slice(0, 40), '| адр:', r.address.slice(0, 90), '|', r.website || ''].join(' | '));
