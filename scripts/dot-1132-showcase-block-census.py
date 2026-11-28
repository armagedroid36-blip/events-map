import re, urllib.request, datetime, concurrent.futures as cf
TODAY = datetime.date(2026, 11, 28)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode("utf-8", "replace")
sm = get("https://mypins.site/sitemap.xml?v=1132")
urls = re.findall(r"<loc>([^<]+)</loc>", sm)
CAT = re.compile(r"mypins\.site/(?:en/)?([a-z-]+)/([a-z-]+)/$")
skip = ("this-week", "today", "weekend")
pages = [u for u in urls if CAT.search(u) and CAT.search(u).group(2) not in skip and "/blog/" not in u]
print("category pages", len(pages))
def block(h, en):
    hd = "Upcoming events" if en else "Ближайшие события"
    m = re.search(re.escape(hd) + r"[^<]*</h2>\s*<ul>(.*?)</ul>", h, re.S)
    if not m: return None
    out = []
    for it in re.findall(r"<li>(.*?)</li>", m.group(1), re.S):
        ds = re.findall(r'<time datetime="(\d{4}-\d{2}-\d{2})"', it)
        if ds: out.append([datetime.date.fromisoformat(d) for d in ds])
    return out
def one(u):
    try:
        h = get(u + "?v=1132")
    except Exception as e:
        return (u, "ERR " + str(e)[:25], None, None)
    items = block(h, "/en/" in u)
    if items is None: return (u, "noblock", None, None)
    return (u, "ok", len(items), [d for d in items if max(d) < TODAY])
res = []
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    res = list(ex.map(one, pages))
ok = [r for r in res if r[1] == "ok"]
bad = [r for r in ok if r[3]]
print("with block", len(ok), "noblock", sum(1 for r in res if r[1]=='noblock'), "errs", sum(1 for r in res if r[1].startswith('ERR')))
print("PAST-pages", len(bad))
for u, _, n, p in bad[:15]:
    print(" ", u, f"{len(p)}/{n}", "min", min(min(x) for x in p))
