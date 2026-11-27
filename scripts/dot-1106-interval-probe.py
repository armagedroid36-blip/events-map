import json, re, math, sys
from datetime import date
d = json.load(open(r"C:\Users\armag\AppData\Local\Temp\snap1106.json"))
cards = d.get("cards") or d.get("events")
print("snapshot", d.get("generated_at"), "count", len(cards))

def pd(s):
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None

# ---------- A: длинные интервалы >= 2 дней ----------
LEGIT = ("фестивал", "festival", "ярмарк", "market", "выставк", "exhibition", "марафон",
         "marathon", "challenge", "чемпионат", "championship", "турнир", "tournament",
         "конференц", "conference", "форум", "forum", "праздник", "празднован", "рождеств",
         "christmas", "новогод", "new year", "карнавал", "carnival", "фиеста", "fiesta",
         "недел", "week", "дн", "дней", "курс", "course", "школ", "school", "лагер", "camp",
         "показ", "кинофест", "широк", "шире", "в программе", "программа")
long_int = []
for c in cards:
    s, e = pd(c.get("start_date") or ""), pd(c.get("end_date") or "")
    if not s or not e:
        continue
    n = (e - s).days
    if n >= 2:
        long_int.append((n, c))
long_int.sort(key=lambda x: -x[0])
print("\n== A. интервал >= 2 дней:", len(long_int))
sus = []
for n, c in long_int:
    t = (c.get("title") or "") + " " + (c.get("title_ru") or "")
    if not any(k in t.lower() for k in LEGIT):
        sus.append((n, c))
print("   без легальных слов (подозрительные):", len(sus))
for n, c in sus[:25]:
    print(f"   {c['id'][:8]} +{n}д {c.get('start_date')}->{c.get('end_date')} {c.get('city')} | {c.get('title')[:70]}")

# ---------- B: одно название (ru/en/осн.) + дата, но пины дальше 500 м ----------
STOP = set("the and for with from это как для что или the in on at of to".split())
def norm_words(*vals):
    w = set()
    for v in vals:
        if not v:
            continue
        for t in re.findall(r"[a-zа-яё0-9]+", str(v).lower()):
            if len(t) >= 4 and t not in STOP:
                w.add(t)
    return w

def dist(a, b):
    lat1, lng1, lat2, lng2 = map(float, (a[0], a[1], b[0], b[1]))
    p = math.pi / 180
    x = (lng2 - lng1) * p * math.cos((lat1 + lat2) * p / 2)
    y = (lat2 - lat1) * p
    return math.hypot(x, y) * 6371.0

have = [c for c in cards if c.get("lat") and c.get("lng")]
by = {}
for c in have:
    key = (c.get("start_date"), frozenset(norm_words(c.get("title"), c.get("title_ru"), c.get("title_en"))))
    by.setdefault(key, []).append(c)

pairs = []
for key, lst in by.items():
    if len(lst) < 2 or len(key[1]) < 2:
        continue
    for i in range(len(lst)):
        for j in range(i + 1, len(lst)):
            a, b = lst[i], lst[j]
            km = dist((a["lat"], a["lng"]), (b["lat"], b["lng"]))
            if km > 0.5:
                pairs.append((km, key[1], a, b))
pairs.sort(key=lambda x: -x[0])
print("\n== B. одно название+дата, пины > 500 м:", len(pairs))
for km, words, a, b in pairs[:15]:
    print(f"   {km:.1f} км | {a['id'][:8]} {a.get('city')} {a.get('title')[:55]}")
    print(f"            | {b['id'][:8]} {b.get('city')} {b.get('title')[:55]}")
    print(f"            слова: {sorted(words)[:6]}")
