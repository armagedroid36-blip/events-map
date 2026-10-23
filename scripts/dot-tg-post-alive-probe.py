"""Зонд: живая карточка ссылается на УДАЛЁННЫЙ пост Telegram.

Чекер ссылок dot-live-link-status.py класс не видит: страница t.me/<канал>/<id>
отдаёт 200 даже для удалённого поста. Признак удаления — блок
`tgme_widget_message_error` («Post not found») на странице `?embed=1`.

Запуск из корня репозитория:  python scripts/dot-tg-post-alive-probe.py
Норма: DEAD = 0. Прокси 10809 обязателен (t.me с RU-IP режется).
"""
import json, re, os, sys, urllib.request
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

rows, off = [], 0
while True:
    req = urllib.request.Request(
        f"{BASE}/rest/v1/events?select=id,title,website,start_date,city&status=eq.active&order=id&offset={off}&limit=1000",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    chunk = json.load(urllib.request.urlopen(req, timeout=60))
    rows += chunk
    if len(chunk) < 1000:
        break
    off += 1000

pat = re.compile(r"t\.me/([A-Za-z0-9_]+)/(\d+)")
cards = [r for r in rows if pat.search(r.get("website") or "")]
print(f"active {len(rows)}, TG-post карточек {len(cards)}", flush=True)

opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}

def check(r):
    m = pat.search(r["website"])
    url = f"https://t.me/{m.group(1)}/{m.group(2)}?embed=1"
    try:
        html = opener.open(urllib.request.Request(url, headers=UA), timeout=15).read().decode("utf-8", "replace")
    except Exception as e:
        return (r, "ERR", f"{type(e).__name__}: {e}"[:80])
    if "tgme_widget_message_error" in html:
        mm = re.search(r"tgme_widget_message_error[^>]*>([^<]{0,60})", html)
        return (r, "DEAD", (mm.group(1).strip() if mm else "error block"))
    if "tgme_widget_message" not in html:
        return (r, "EMPTY", "нет разметки сообщения")
    return (r, "OK", "")

dead, err = [], []
with ThreadPoolExecutor(max_workers=12) as ex:
    for r, st, info in ex.map(check, cards):
        if st == "DEAD":
            dead.append((r, info))
        elif st == "ERR":
            err.append((r, info))
print(f"OK {len(cards)-len(dead)-len(err)}, DEAD {len(dead)}, ERR {len(err)}", flush=True)
for r, info in dead:
    print(f"DEAD {r['id']} | {r['start_date']} | {r['city']} | {r['title'][:55]} | {r['website']} | {info}", flush=True)
for r, info in err[:10]:
    print(f"ERR  {r['id']} | {r['website']} | {info}", flush=True)
sys.exit(0 if not dead else 1)
