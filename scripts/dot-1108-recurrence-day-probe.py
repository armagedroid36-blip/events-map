#!/usr/bin/env python3
"""Точка «События», run 1108. Офлайн-класс (при 402): «recurrence не содержит дня недели start_date».

Инвариант: у живых карточек с recurrence.freq=weekly массив days (1=Пн..7=Вс) обязан
содержать день недели start_date — иначе фронт `recurrence.ts` покажет серию не с той даты,
с которой она реально идёт (и параллельно может печатать день из названия).

0 запросов к базе: читает прод-снимок data/events.json (?v=epoch).
"""
import json, sys, time, urllib.request

BASE = "https://mypins.site/data/events.json"


def load():
    url = f"{BASE}?v={int(time.time())}"
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "hermes-dot-events/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def days_of(rec):
    if not isinstance(rec, dict):
        return None
    if str(rec.get("freq", "")).lower() != "weekly":
        return None
    d = rec.get("days") or rec.get("day")
    if d is None:
        return None
    if isinstance(d, (int, str)):
        d = [d]
    out = []
    for x in d:
        try:
            out.append(int(x))
        except Exception:
            pass
    return out or None


def main():
    data = load()
    events = data.get("cards") or data.get("events") or []
    gen = data.get("generated_at") or data.get("generatedAt")
    print(f"снимок: generated_at {gen}, карточек {len(events)}")

    live = events

    with_rec = 0
    checked = 0
    bad = []
    for e in live:
        ds = days_of(e.get("recurrence"))
        if not ds:
            continue
        with_rec += 1
        sd = (e.get("start_date") or "")[:10]
        if not sd:
            continue
        try:
            y, m, dd = map(int, sd.split("-"))
            import datetime
            wd = datetime.date(y, m, dd).isoweekday()
        except Exception:
            continue
        checked += 1
        if wd not in ds:
            bad.append((e.get("id"), sd, wd, sorted(ds), (e.get("title_ru") or e.get("title") or "")[:70], e.get("city")))

    print(f"с weekly-recurrence: {with_rec}; сверено с start_date: {checked}")
    print(f"РАСХОЖДЕНИЙ (день start_date вне days): {len(bad)}")
    names = {1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Вс"}
    for b in bad:
        print(f"  {b[0]} {b[1]} ({names[b[2]]}) days={b[3]} | {b[5]} | {b[4]}")

    # Секция B: название само называет день недели — сверяем с days (класс Red Ruby)
    import re
    WD = [
        (1, r"понед[её]льник|monday|\bпн\b|\bmon\b"),
        (2, r"вторник|tuesday|\bвт\b|\btue(s)?\b"),
        (3, r"сред[ауы]|wednesday|\bср\b|\bwed\b"),
        (4, r"четверг|thursday|\bчт\b|\bthu(rs)?\b"),
        (5, r"пятниц|friday|\bпт\b|\bfri\b"),
        (6, r"суббот|saturday|\bсб\b|\bsat\b"),
        (7, r"воскресен|sunday|\bвс\b|\bsun\b"),
    ]
    titled = 0
    mismatch = []
    for e in live:
        ds = days_of(e.get("recurrence"))
        if not ds:
            continue
        t = " ".join(str(e.get(k) or "") for k in ("title", "title_ru", "title_en")).lower()
        found = [n for n, rx in WD if re.search(rx, t)]
        if len(found) != 1:
            continue
        titled += 1
        if found[0] not in ds:
            mismatch.append((e.get("id"), names[found[0]], sorted(ds), e.get("city"), (e.get("title") or "")[:70]))
    print(f"\nB) серии, где в названии ровно один день недели: {titled}; расхождений с days: {len(mismatch)}")
    for m in mismatch:
        print(f"  {m[0]} название={m[1]} days={m[2]} | {m[3]} | {m[4]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
