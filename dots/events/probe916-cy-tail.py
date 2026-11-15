#!/usr/bin/env python
"""probe916-cy-tail.py — полный backlog Кипра: хвост городских срезов CN за первыми 200 записями.

probe915 мерил только первые 200 записей города (срез CN жёстко режется), поэтому 86 новых было
НИЖНЕЙ границей. Здесь добираются offset=200/400 по двум городам, которые упираются в лимит
(limassol, nicosia), и считается:
  1) сколько новых событий в хвосте;
  2) сколько из полного backlog реально доедет за ОДИН прогон сборщика с учётом квоты на город
     (collectCyprus.mjs: budget = min(120, MAX_EVENTS), perCity = max(15, ceil(budget/7))).

Матчинг с карточкой — по всем псевдонимам названия (title/title_ru/title_en), иначе переведённые
названия читаются как новые (питфол замера 915).
Запуск: python probe916-cy-tail.py   (снапшот %TEMP%\\prod-914.json, прокси 10809)
"""
import json, os, re, subprocess, datetime, math

T = os.environ.get("LOCALAPPDATA", r"C:\Users\armag\AppData\Local") + r"\Temp"
TODAY = datetime.date.today()
PROXY = "http://127.0.0.1:10809"
CITIES = ["limassol", "nicosia", "larnaca", "paphos"]
TAIL_CITIES = ["limassol", "nicosia"]
STOP = set("""для как что это его она они там тут уже ещё есть был была будут будет или под над при без про
через очень можно нужно весь вся все свой своя the and for with from fest festival party night live show
cyprus кипр""".split())


def words(t):
    return {w for w in re.findall(r"[^\W\d_]{4,}", (t or "").lower()) if w not in STOP}


def matches(card_title, ev_title):
    a, b = words(card_title), words(ev_title)
    if not a or not b:
        return False
    common = a & b
    if len(common) >= 2:
        return True
    if common:
        short_set = a if len(a) <= len(b) else b
        if len(common) / max(1, len(short_set)) >= 0.6:
            return True
    return False


def fetch(city, offset):
    f = os.path.join(T, f"cn-{city}-{offset}.json")
    url = f"https://cyprusnow.app/api/events?city={city}&limit=200"
    if offset:
        url += f"&offset={offset}"
    subprocess.run(["curl", "-s", "-x", PROXY, "--max-time", "45", url, "-o", f], check=False)
    try:
        d = json.load(open(f, encoding="utf-8"))
        return d.get("events") or []
    except Exception as e:
        print(f"[warn] {city}@{offset}: {e}")
        return []


snap = json.load(open(os.path.join(T, "prod-914.json"), encoding="utf-8"))
cards = snap.get("cards") or snap.get("events") or []
cy = [c for c in cards if (c.get("city") or "").rstrip().endswith("Кипр")]
print(f"снапшот: карточек {len(cards)}, кипрских {len(cy)}, generated_at {snap.get('generated_at')}")

# бюджет прогона как в коде: MIN(120, MAX_EVENTS=150); городов 7
budget = 120
per_city = max(15, math.ceil(budget / 7))
print(f"квота сборщика: budget={budget}, perCity={per_city}, городов 7 -> потолок прогона {min(budget, per_city*7)}")

seen_slugs = {}
per_city_new = {}
for city in CITIES:
    evs = []
    offsets = [0] + ([200, 400] if city in TAIL_CITIES else [])
    for off in offsets:
        page = fetch(city, off)
        if off:
            print(f"   {city} offset={off}: записей {len(page)}")
        evs.extend(page)
        if off and len(page) < 200:
            break
    new, fut, tail_new = [], 0, 0
    for e in evs:
        sa = e.get("start_at") or ""
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", sa)
        if not m:
            continue
        d = datetime.date(*map(int, m.groups()))
        if d < TODAY:
            continue
        slug = e.get("slug") or (e.get("title") or "") + sa
        if slug in seen_slugs:
            continue
        seen_slugs[slug] = city
        fut += 1
        t = e.get("title") or ""
        is_new = not any(matches(c.get(f) or "", t) for c in cy
                         for f in ("title", "title_ru", "title_en"))
        if is_new:
            new.append((d, t, e.get("venue_name"), slug))
            if slug not in {s for s in []}:
                pass
    per_city_new[city] = len(new)
    print(f"\n== {city}: записей {len(evs)}, будущих {fut}, НОВЫХ {len(new)}")
    for d, t, v, s in sorted(new)[:8]:
        print(f"   {d}  {t[:66]}  @ {v}")

total_new = sum(per_city_new.values())
print(f"\nПОЛНЫЙ backlog по 4 срезам с хвостом: {total_new}  ({per_city_new})")
covered = sum(min(n, per_city) for n in per_city_new.values())
print(f"доедет за ОДИН прогон с perCity={per_city}: {min(covered, budget)} из {total_new}, "
      f"остаток {total_new - min(covered, budget)} — следующим прогоном (ключ/website уже заняты)")
