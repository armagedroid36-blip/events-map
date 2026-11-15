#!/usr/bin/env python
"""probe915-cy-backlog.py — точная цена простоя сбора для КИПРА (последний незамеренный регион).

До сих пор в STATE фигурировало «Кипр — сотни новых» без замера. Зонд берёт городские срезы
ленты Cyprus Now (limassol, nicosia, larnaca, paphos; limit=200, через прокси 10809), оставляет
события с будущей датой и сверяет с прод-снапшотом data/events.json (1307 карточек).

Совпадение: >=2 общих значимых слова названия ИЛИ одно слово, покрывающее >=60% слов названия.
Дата не требуется (у серий карточка уже есть). Кириллица/греческий сохраняются (isalnum).

Питфолы, учтённые здесь:
- срез города жёстко режется 200 записями (считать «нет в фиде» = «нет события» нельзя);
- большие ответы CN с RU-IP рвутся Cloudflare ⇒ только через прокси 10809;
- дубли между срезами (одно событие в двух городах) снимаются по slug.

Запуск: python probe915-cy-backlog.py   (снапшот: %TEMP%\\prod-914.json)
"""
import json, os, re, subprocess, datetime, urllib.parse

T = os.environ.get("LOCALAPPDATA", r"C:\Users\armag\AppData\Local") + r"\Temp"
TODAY = datetime.date.today()
PROXY = "http://127.0.0.1:10809"
CITIES = ["limassol", "nicosia", "larnaca", "paphos"]
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
        biggest = max(len(w) for w in common)
        shorter = min(len(a), len(b))
        if shorter and biggest and len([w for w in (a if len(a) <= len(b) else b)]) > 0:
            # одно общее слово покрывает >=60% слов более короткого названия
            short_set = a if len(a) <= len(b) else b
            if len(common) / max(1, len(short_set)) >= 0.6:
                return True
    return False


def feed(city):
    f = os.path.join(T, f"cn-{city}.json")
    url = f"https://cyprusnow.app/api/events?city={city}&limit=200"
    subprocess.run(["curl", "-s", "-x", PROXY, "--max-time", "40", url, "-o", f], check=False)
    try:
        d = json.load(open(f, encoding="utf-8"))
        return d.get("events") or []
    except Exception as e:
        print(f"[warn] {city}: {e}")
        return []


snap = json.load(open(os.path.join(T, "prod-914.json"), encoding="utf-8"))
cards = snap.get("cards") or snap.get("events") or []
cy = [c for c in cards if (c.get("city") or "").rstrip().endswith("Кипр")]
print(f"снапшот: карточек всего {len(cards)}, кипрских {len(cy)}, generated_at {snap.get('generated_at')}")

seen = {}
for city in CITIES:
    evs = feed(city)
    fut, new = [], []
    for e in evs:
        sa = e.get("start_at") or ""
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", sa)
        if not m:
            continue
        d = datetime.date(*map(int, m.groups()))
        if d < TODAY:
            continue
        slug = e.get("slug") or ""
        if slug in seen:
            continue
        seen[slug] = city
        fut.append((d, e.get("title") or "", e.get("venue_name"), slug))
        t = e.get("title") or ""
        if not any(matches(c.get("title") or "", t) for c in cy):
            new.append((d, t, e.get("venue_name"), slug))
    print(f"\n== {city}: записей {len(evs)}, будущих {len(fut)}, НОВЫХ (нет на карте) {len(new)}")
    for d, t, v, s in sorted(new)[:12]:
        print(f"   {d}  {t[:70]}  @ {v}")

print(f"\nвсего уникальных слаг по 4 срезам: {len(seen)}")
