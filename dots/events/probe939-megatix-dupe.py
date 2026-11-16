import os, json, re, urllib.request, urllib.parse, math, time, sys

ENV = os.path.expanduser("~/projects/events-map/.env")
env = {}
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k.strip()] = v.strip().strip('"').strip("'")
URL = env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
KEY = env.get("SUPABASE_SERVICE_ROLE") or env.get("VITE_SUPABASE_SERVICE_ROLE") or ""
if not URL or not KEY:
    print("NO KEYS")
    sys.exit(1)


def get(path, params, tries=4):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(URL + "/rest/v1/" + path + "?" + q)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", "Bearer " + KEY)
    req.add_header("Accept-Encoding", "identity")
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(2)
    raise last


def rows(sel, filt):
    out = []
    off = 0
    page = 50
    while True:
        p = {"select": sel, "order": "start_date.asc,id.asc", "limit": str(page), "offset": str(off)}
        p.update(filt)
        chunk = get("events", p)
        out.extend(chunk)
        if len(chunk) < page:
            break
        off += page
    return out


CITIES = ["Убуд", "Чангу", "Семиньяк", "Беноа", "Санур", "Табанан", "Печату", "Кута", "Джимбаран", "Керобокан"]
SEL = "id,title,title_en,start_date,start_time,city,address,lat,lng,website,status"
found = {}
for c in CITIES:
    flt = {"status": "eq.active", "city": "ilike." + c + "*"}
    for r in rows(SEL, flt):
        found[r["id"]] = r
allrows = list(found.values())
meg = []
other = []
for r in allrows:
    site = r.get("website") or ""
    if "megatix" in site:
        meg.append(r)
    else:
        other.append(r)
print("живых в этих городах:", len(allrows), "| megatix:", len(meg), "| других:", len(other))

STOP_TEXT = "the and for with bali ubud canggu seminyak sanur tabanan pecatu kuta jimbaran event events experience workshop class show party night day week open special guest club concert festival yoga dance retreat course training session live music"
STOP = set(STOP_TEXT.split())


def words(t):
    t = (t or "").lower()
    t = re.sub("[^0-9a-zа-яё]+", " ", t)
    return set(w for w in t.split() if len(w) >= 4 and w not in STOP)


def dist(a, b):
    la1 = float(a["lat"])
    lo1 = float(a["lng"])
    la2 = float(b["lat"])
    lo2 = float(b["lng"])
    h = math.sin(math.radians(la2 - la1) / 2) ** 2 + math.cos(math.radians(la1)) * math.cos(math.radians(la2)) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


pairs = []
for m in meg:
    mw = words(m.get("title")) | words(m.get("title_en"))
    for o in other:
        try:
            d0 = (__import__("datetime").date.fromisoformat(o.get("start_date")) - __import__("datetime").date.fromisoformat(m.get("start_date"))).days
        except Exception:
            d0 = 9
        if abs(d0) > 1:
            continue
        ow = words(o.get("title")) | words(o.get("title_en"))
        common = mw & ow
        if len(common) < 2:
            continue
        try:
            d = dist(m, o)
        except Exception:
            d = None
        pairs.append((len(common), d, sorted(common), m, o))

pairs.sort(key=lambda x: (-x[0], x[1] if x[1] is not None else 999))
print("")
print("ПАР-КАНДИДАТОВ (та же дата + >=2 общих значимых слова):", len(pairs))
for n, d, common, m, o in pairs[:12]:
    print("---", n, common, "| dist", (round(d, 2) if d is not None else "?"), "км")
    print("  MEG", m["id"][:8], (m.get("title") or "")[:65], "|", m.get("start_time"), "|", m.get("city"))
    print("  OTH", o["id"][:8], (o.get("title") or "")[:65], "|", o.get("start_time"), "|", o.get("city"), "|", (o.get("website") or "")[:55])


# КОНТРОЛЬ: копия одной megatix-карточки должна дать пару (проверка, что зонд не слеп)
if meg:
    ctl = dict(meg[0])
    ctl["id"] = "ctl00000"
    ctl["title"] = (ctl.get("title") or "") + " (контроль)"
    other.append(ctl)
    cnt = 0
    mw = words(meg[0].get("title")) | words(meg[0].get("title_en"))
    ow = words(ctl["title"]) | words(ctl.get("title_en"))
    if len(mw & ow) >= 2:
        cnt = 1
    print("КОНТРОЛЬ: пар с копией =", cnt)
