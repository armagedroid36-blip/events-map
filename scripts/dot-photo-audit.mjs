// Аудит фото активных карточек: проверяет, что URL фото живой и это картинка
// (а не заглушка/логотип сайта). Запуск: node --env-file=.env scripts/dot-photo-audit.mjs [хост-фильтр] [сколько]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const HOST = process.argv[2] || '';
const LIMIT = Number(process.argv[3] || 8);
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const rows = await selectAll(db, 'events', 'id,status,title,city,start_date,photos,website,source_type');
const withFoto = rows.filter((r) => r.status === 'active' && (r.photos || []).length);
const sample = (HOST ? withFoto.filter((r) => (r.photos[0] || '').includes(HOST)) : withFoto).slice(0, LIMIT);
console.log('active с фото:', withFoto.length, '| проверяю:', sample.length, HOST ? '(' + HOST + ')' : '');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
for (const r of sample) {
  const url = r.photos[0];
  let out = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA }, method: 'GET' });
    clearTimeout(t);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const magic = buf.slice(0, 4).toString('hex');
    const isImg =
      ct.startsWith('image/') ||
      magic.startsWith('ffd8') ||
      magic.startsWith('89504e47') ||
      buf.slice(0, 4).toString('ascii').includes('GIF');
    out = `HTTP ${res.status} ${ct} ${(buf.length / 1024).toFixed(0)}КБ img=${isImg}`;
  } catch (e) {
    out = 'ОШИБКА ' + (e.name || e.message);
  }
  const sus = /og-default|placeholder|\/logo|sprite|favicon|icon/i.test(url) ? ' ПОДОЗРЕНИЕ' : '';
  console.log(`  ${r.id.slice(0, 8)} ${r.city} ${r.start_date} | ${out}${sus}`);
  console.log(`    ${r.title.slice(0, 55)} | ${url.slice(0, 110)}`);
}
