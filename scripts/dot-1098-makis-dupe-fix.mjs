/**
 * dot-1098: ремонт пары «Makis Dimakis in Protaras» (26.12 21:30, площадка Velissima).
 *
 * Арбитр (замер 1097): Nominatim «Velissima Protaras» → 35.0320135,34.0311552,
 * адрес «Velissima, 29, Leoforos Perneras, Πρωταράς» ⇒ площадка в Протарасе;
 * пин греческой копии (35.0318592,34.0314665) верный, пин EN-копии стоял на
 * центре Протараса (35.0108,34.0573), метка греческой — округ «Фамагуста».
 *
 * План: канон 6ce9b389 — пин на Velissima; затем 173fc77c → archived/reject duplicate.
 * Запуск: node --env-file=.env scripts/dot-1098-makis-dupe-fix.mjs           (DRY)
 *         APPLY=1 node --env-file=.env scripts/dot-1098-makis-dupe-fix.mjs   (применить)
 */
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(2); }

const APPLY = process.env.APPLY === '1';
const CANON = '6ce9b389';
const COPY = '173fc77c';
const VELISSIMA = { lat: 35.0320135, lng: 34.0311552 };
const CACHE = '?v=' + Date.now();

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const api = (path, opts = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

async function active(idPrefix) {
  // узкий срез по дате события (26.12), а не вся таблица — экономия egress
  const r = await api(`events?select=id,title,city,address,start_date,start_time,status,lat,lng&status=eq.active&start_date=eq.2026-12-26`);
  if (r.status === 402) throw new Error('402 egress quota — база недоступна, ремонт отменён');
  if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  const hit = rows.filter(x => x.id.startsWith(idPrefix));
  return hit.length === 1 ? hit[0] : null;
}

(async () => {
  const canon = await active(CANON);
  const copy = await active(COPY);
  console.log('канон :', canon ? `${canon.id} | ${canon.title} | ${canon.city} | ${canon.start_date} ${canon.start_time} | ${canon.lat},${canon.lng}` : 'НЕ НАЙДЕН');
  console.log('копия :', copy ? `${copy.id} | ${copy.title} | ${copy.city} | ${copy.start_date} ${copy.start_time} | ${copy.lat},${copy.lng}` : 'НЕ НАЙДЕН');

  if (!canon || !copy) { console.log('ОТКАЗ: обе карточки должны быть active'); process.exit(1); }
  if (canon.start_date !== copy.start_date || String(canon.start_time || '').slice(0, 5) !== String(copy.start_time || '').slice(0, 5)) {
    console.log('ОТКАЗ: дата/время разошлись — пара больше не дубль'); process.exit(1);
  }
  const near = (c) => Math.abs(c.lat - VELISSIMA.lat) < 0.02 && Math.abs(c.lng - VELISSIMA.lng) < 0.02;
  if (!near(copy)) console.log('ВНИМАНИЕ: пин греческой копии больше не у Velissima, проверь арбитра заново');
  if (canon.city && !canon.city.startsWith('Протарас')) console.log('ВНИМАНИЕ: метка канона не Протарас:', canon.city);

  if (!APPLY) {
    console.log('DRY: PATCH канон пин →', VELISSIMA, '+ auto_review publish/pin-fix');
    console.log('DRY: PATCH копия → archived + auto_review reject/duplicate');
    return;
  }

  const p1 = await api(`events?id=eq.${canon.id}&status=eq.active`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      lat: VELISSIMA.lat, lng: VELISSIMA.lng,
      auto_review: { verdict: 'publish', reasons: ['dot-1098 pin-fix: Velissima, 29 Leoforos Perneras, Protaras (Nominatim 35.0320135,34.0311552)'] },
    }),
  });
  console.log('канон PATCH:', p1.status, (await p1.text()).slice(0, 200));

  const p2 = await api(`events?id=eq.${copy.id}&status=eq.active`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'archived',
      auto_review: { verdict: 'reject', reasons: ['duplicate', `dot-1098: та же площадка Velissima, 26.12 21:30, другое написание названия; канон ${CANON}`] },
    }),
  });
  console.log('копия PATCH:', p2.status, (await p2.text()).slice(0, 200));

  const back = await api(`events?select=id,status,lat,lng,city&or=(id.eq.${canon.id},id.eq.${copy.id})`);
  console.log('readback:', await back.text());
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
