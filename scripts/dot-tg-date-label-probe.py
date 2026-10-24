"""Зонд: дата карточки vs явный ярлык «#дата: DD.MM» в тексте поста Telegram.

Класс из run 443: parseDate брал прошедший ярлык и уезжал на «следующий день
недели» (карточка 8167746c стояла 30.10 при посте «#дата: 23.10»). Корень
починен (коммит 7c886a67a3e) — этот зонд меряет ОСТАТОК класса в базе:
у живых TG-карточек читает пост (`?embed=1` через прокси 10809), достаёт
явные ярлыки даты (#дата:, «📆 ДЕНЬ | DD.MM») и сравнивает с start_date.

Запуск из корня репозитория:  python scripts/dot-tg-date-label-probe.py
Норма: MISMATCH = 0. Прокси 10809 обязателен (t.me с RU-IP режется).
LIMIT=N — проверить только первые N карточек.
"""
import json, re, os, sys, urllib.request, datetime
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
BASE = env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
KEY = env.get("SUPABASE_SERVICE_ROLE")
PROXY = os.environ.get("PROXY", "http://127.0.0.1:10809")
LIMIT = int(os.environ.get("LIMIT", "0"))

rows, off = [], 0
while True:
    req = urllib.request.Request(
        f"{BASE}/rest/v1/events?select=id,title,website,start_date,start_time,city&status=eq.active&order=id&offset={off}&limit=1000",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    chunk = json.load(urllib.request.urlopen(req, timeout=60))
    rows += chunk
    if len(chunk) < 1000:
        break
    off += 1000

pat = re.compile(r"t\.me/([A-Za-z0-9_]+)/(\d+)")
cards = [r for r in rows if pat.search(r.get("website") or "")]
if LIMIT:
    cards = cards[:LIMIT]
print(f"active {len(rows)}, TG-post карточек {len(cards)}", flush=True)

opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
TAG = re.compile(r"<[^>]+>")
LABELS = [
    re.compile(r"#дата[:\s]*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?", re.I),
    re.compile(r"#date[:\s]*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?", re.I),
    re.compile(r"(?:📆|🗓)\s*[^|｜\n]{0,20}[|｜]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?"),
]

def labels_of(text):
    out = []
    for rx in LABELS:
        for m in rx.finditer(text):
            d, mo = int(m.group(1)), int(m.group(2))
            y = m.group(3)
            if y:
                y = int(y)
                if y < 100:
                    y += 2000
            if 1 <= d <= 31 and 1 <= mo <= 12:
                out.append((y, mo, d, m.group(0).strip()[:40]))
    return out

def check(r):
    m = pat.search(r["website"])
    url = f"https://t.me/{m.group(1)}/{m.group(2)}?embed=1"
    try:
        html = opener.open(urllib.request.Request(url, headers=UA), timeout=15).read().decode("utf-8", "replace")
    except Exception as e:
        return (r, "ERR", f"{type(e).__name__}: {e}"[:70], [])
    if "tgme_widget_message_error" in html:
        return (r, "DEAD", "post not found", [])
    mm = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', html, re.S)
    text = TAG.sub(" ", mm.group(1)).replace("&quot;", '"').replace("&amp;", "&") if mm else ""
    if not text.strip():
        return (r, "NOTEXT", "", [])
    labs = labels_of(text)
    if not labs:
        return (r, "NOLABEL", "", [])
    sd = datetime.date.fromisoformat(r["start_date"])
    for (y, mo, d, raw) in labs:
        if y is not None and y != sd.year:
            continue
        if mo == sd.month and d == sd.day:
            return (r, "OK", raw, labs)
    return (r, "MISMATCH", labs[0][3], labs)

res = []
with ThreadPoolExecutor(max_workers=20) as ex:
    for out in ex.map(check, cards):
        res.append(out)

cnt = {}
mis = []
for r, st, info, labs in res:
    cnt[st] = cnt.get(st, 0) + 1
    if st == "MISMATCH":
        mis.append((r, info, labs))
print(f"OK {cnt.get('OK',0)}, MISMATCH {len(mis)}, NOLABEL {cnt.get('NOLABEL',0)}, "
      f"DEAD {cnt.get('DEAD',0)}, NOTEXT {cnt.get('NOTEXT',0)}, ERR {cnt.get('ERR',0)}", flush=True)
for r, info, labs in mis:
    print(f"MISMATCH {r['id'][:8]} | карточка {r['start_date']} {r['start_time'] or ''} | "
          f"пост «{info}» | {r['city']} | {r['title'][:50]} | {r['website']}", flush=True)
sys.exit(0 if not mis else 1)
