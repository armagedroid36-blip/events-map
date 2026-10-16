import os, json, urllib.request, urllib.parse, urllib.error, concurrent.futures, time, collections

ROOT = r"C:\Users\armag\projects\events-map"
env = {}
for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL = env["VITE_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE"]
PROXY = "http://127.0.0.1:10809"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
# ПИТФОЛ: часть живых сайтов не пускает именно через туннель (000 по таймауту), а напрямую
# отвечает 200 (проверено: uluwatutemple.id 000/15с через прокси, 200 за 1с напрямую).
# Без прямого добора такие ссылки попадают в отчёт как «мёртвые» — ложный класс дефектов.
direct = urllib.request.build_opener(urllib.request.ProxyHandler({}))
H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
}

def sb(path):
    req = urllib.request.Request(URL + "/rest/v1/" + path,
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json"})
    for _ in range(4):
        try:
            return json.loads(opener.open(req, timeout=40).read().decode("utf-8"))
        except Exception as e:
            err = e; time.sleep(2)
    raise err

rows, off = [], 0
while True:
    page = sb("events?select=id,website,status,city,title,start_date&status=in.(active,moderation)&website=not.is.null&order=id&limit=1000&offset=%d" % off)
    rows += page
    if len(page) < 1000:
        break
    off += 1000

targets, seen = [], set()
for r in rows:
    w = (r.get("website") or "").strip()
    if not w.startswith("http"):
        continue
    key = (r["id"], w)
    if key in seen:
        continue
    seen.add(key)
    targets.append((r["id"], w, r.get("status"), (r.get("title") or "")[:60]))

print("living cards with website:", len(rows), "| unique links:", len(targets), flush=True)

def check(item):
    cid, u, st, ti = item
    # PITFALL: fragment must be stripped - servers answer 404 with '#anchor' in path
    clean = u.split("#")[0]
    safe = urllib.parse.quote(clean, safe=":/?&=%")
    last = None
    for method in ("HEAD", "GET"):
        try:
            with opener.open(urllib.request.Request(safe, method=method, headers=H), timeout=15) as resp:
                return (cid, u, st, ti, resp.status, None)
        except urllib.error.HTTPError as e:
            last = e.code
            if method == "HEAD" and e.code in (403, 405, 406, 501):
                continue
            return (cid, u, st, ti, e.code, None)
        except Exception as e:
            last = type(e).__name__
    # прокси-маршрут не дал статуса — пробуем напрямую, иначе ссылка ложно уйдёт в «мёртвые»
    if isinstance(last, str):
        for method in ("HEAD", "GET"):
            try:
                with direct.open(urllib.request.Request(safe, method=method, headers=H), timeout=15) as resp:
                    return (cid, u, st, ti, resp.status, "direct")
            except urllib.error.HTTPError as e:
                return (cid, u, st, ti, e.code, "direct")
            except Exception as e:
                last = last + "/direct:" + type(e).__name__
    return (cid, u, st, ti, None, last)

t0 = time.time()
bad, direct_only = [], []
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
    for cid, u, st, ti, status, err in ex.map(check, targets):
        if status != 200:
            bad.append((cid, st, status, err, ti, u))
        elif err == "direct":
            direct_only.append((cid, st, ti, u))
print("checked %d in %.0fs | non-200: %d" % (len(targets), time.time() - t0, len(bad)), flush=True)
for cid, st, ti, u in direct_only:
    print("DIRECT-ONLY", cid, st, ti, u, flush=True)
byhost = collections.Counter(urllib.parse.urlparse(b[5]).netloc for b in bad)
for h, c in byhost.most_common(20):
    print("  ", c, h, flush=True)
for b in bad[:60]:
    print("   BAD", b[0], b[1], b[2] or b[3], "|", b[4], "|", b[5][:130], flush=True)
