// Читающий зонд: живые балийские карточки, у которых адрес/метка конфликтуют с порядком ADDRESS_DISTRICTS.
// Запуск: node --env-file=.env scripts/dot-bali-addr-district-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { ADDRESS_DISTRICTS } from './bali-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,status,start_date,website,source_type', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});

const bali = rows.filter((r) => (r.city || '').includes('Bali'));
console.log('живых балийских карточек:', bali.length);

const KEYS = ['jimbaran', 'nusa dua', 'tanjung', 'benoa', 'sukawati', 'lodtunduh', 'singakerta', 'ubud', 'kerobokan', 'ungasan', 'pecatu'];
const cityOf = {};
for (const [kw, label] of ADDRESS_DISTRICTS) cityOf[kw] = label;

const hits = [];
for (const r of bali) {
  const a = (r.address || '').toLowerCase();
  const matched = ADDRESS_DISTRICTS.filter(([kw]) => a.includes(kw)).map(([kw, l]) => `${kw}->${l}`);
  if (matched.length === 0) continue;
  const distinctLabels = [...new Set(ADDRESS_DISTRICTS.filter(([kw]) => a.includes(kw)).map(([, l]) => l))];
  if (distinctLabels.length > 1) {
    hits.push({ id: r.id.slice(0, 8), city: r.city, winner: distinctLabels[0], all: distinctLabels, matched, address: r.address, title: r.title_ru || r.title });
  }
}
console.log('карточек с конфликтом ключей адреса:', hits.length);
for (const h of hits) console.log(JSON.stringify(h, null, 1));

// отдельно: ключевые для лида карточки
for (const r of bali) {
  const t = (r.title_ru || r.title || '') + ' ' + (r.title || '');
  if (/decade of memories|quiz einstein|квиз эйнштейн|десятилети/i.test(t)) {
    console.log('ЛИД:', JSON.stringify({ id: r.id.slice(0, 8), title: r.title, title_ru: r.title_ru, city: r.city, address: r.address, website: r.website }, null, 1));
  }
}
