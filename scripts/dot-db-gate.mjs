// Гейт «сбор не отработал вхолостую»: последний шаг workflow Collect events.
//
// Зачем: 27.11.2026 прогон 46013725841 при полностью ограниченном проекте
// (402 exceed_egress_quota) отчитался `success` — все 169 вставок упали
// «Ошибка вставки …», а GitHub показывал зелёный прогон. Тихий успех маскирует
// и квоту, и поломку ключей: мониторинг и сторож видят «сбора не было», но не
// «сбор не смог записать».
//
// Правило: если база недоступна на чтение — прогон обязан стать КРАСНЫМ с
// понятной причиной. Ставится ПОСЛЕДНИМ шагом, чтобы ложное срабатывание
// (сетевой блик) не съедало слот сбора.
//
// Коды: 0 — база доступна, 1 — недоступна/ограничена.

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

function die(msg) {
  console.error(`ГЕЙТ БАЗЫ: ${msg}`);
  process.exit(1);
}

if (!url || !key) die('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE в окружении');

async function probe() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${url}/rest/v1/events?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
      signal: ctrl.signal,
    });
    const body = await res.text().catch(() => '');
    return { status: res.status, body, range: res.headers.get('content-range') || '' };
  } finally {
    clearTimeout(t);
  }
}

let last = null;
for (let i = 1; i <= 3; i++) {
  try {
    last = await probe();
    if (last.status === 200) break;
  } catch (e) {
    last = { status: 0, body: String(e && e.message ? e.message : e), range: '' };
  }
  if (i < 3) await new Promise((r) => setTimeout(r, 5000));
}

if (!last) die('нет ответа от REST');
if (last.status === 200) {
  const total = last.range.includes('/') ? last.range.split('/').pop() : '?';
  console.log(`ГЕЙТ БАЗЫ: OK, строк в events ${total}`);
  process.exit(0);
}

const snippet = String(last.body || '').replace(/\s+/g, ' ').slice(0, 200);
if (last.status === 402 && /exceed_egress_quota/i.test(last.body)) {
  die('402 exceed_egress_quota — проект ограничен по трафику, прогон собран вхолостую. '
    + 'Владельцу: снять spend cap/повысить план. Ключи не трогать.');
}
if (last.status === 401 || last.status === 403) {
  die(`HTTP ${last.status} — ключ service-role не принят: ${snippet}`);
}
die(`HTTP ${last.status || 'нет ответа'} — база недоступна: ${snippet}`);
