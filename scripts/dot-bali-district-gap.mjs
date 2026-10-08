// Метки city у балийских карточек: канон ли, и не сидят ли они на центре острова.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });
const CANON = ['Убуд','Печату (Улувату)','Чангу','Семиньяк','Кута','Санур','Денпасар','Беноа (Нуса Дуа)','Табанан','Амед','Сидемен','Ловина','Легиан','Керобокан','Унгасан','Сукавати','Джимбаран','Bali','Джакарта','Кутух','Пандава','Тегалаланг','Чандидаса'];
const rows = await selectAll(db, 'events', 'id,status,city,title,start_date,lat,lng,source_type,website', { filter: q => q.in('status', ['active','moderation']) });
const bali = rows.filter(r => /bali|бали|Canggu|Ubud|Uluwatu|Cemagi|Balian|Kuta|Sanur|Seminyak|Jimbaran|Nusa|Tabanan|Amed|Sidemen|Lovina|Legian|Kerobokan|Ungasan|Sukawati|Gianyar|Denpasar/i.test(String(r.city) + ' ' + String(r.website)));
const byCity = new Map();
for (const r of bali) byCity.set(r.city, [...(byCity.get(r.city) || []), r]);
console.log('Живых балийских карточек:', bali.length, '| меток:', byCity.size);
const isCanon = (c) => CANON.some(k => String(c).toLowerCase().startsWith(k.toLowerCase()));
const fallback = (r) => r.lat && Math.abs(r.lat + 8.4095) < 0.0012 && Math.abs(r.lng - 115.1889) < 0.0012;
for (const [c, list] of [...byCity.entries()].sort((a,b)=>b[1].length-a[1].length)) {
  const nf = list.filter(fallback).length;
  const canon = isCanon(c);
  console.log(`${String(list.length).padStart(3)}  ${String(c).padEnd(22)} ${canon ? 'канон' : 'НЕ КАНОН'}  на_центре_острова=${nf}`);
  if (!canon) for (const r of list.slice(0,6)) console.log(`      ${r.id.slice(0,8)} [${r.status}] ${r.start_date} ${String(r.title).slice(0,40)} | ${r.website}`);
}
