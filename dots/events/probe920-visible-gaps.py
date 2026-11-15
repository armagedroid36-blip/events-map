#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""probe920-visible-gaps: какие города/районы ПУСТЫ на живой карте СЕГОДНЯ.

Логика видимости повторяет фронт (src/lib/eventFilters.ts:49):
  событие видно, если filters.date пуст и isUpcoming(ev) — т.е.
  end_date >= today (или start_date >= today), ЛИБО есть recurrence
  (регулярные фронт считает от сегодня: src/lib/recurrence.ts).
Данные — публичный снапшот витрины data/events.json (REST базы под 402).
"""
import json, sys, urllib.request, datetime

TODAY = datetime.date.today().isoformat()

def load():
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://mypins.site/data/events.json",
                                         headers={"User-Agent": "hermes-dot-events/1.0"})
            raw = urllib.request.urlopen(req, timeout=60).read()
            if len(raw) > 1000:
                return json.loads(raw.decode("utf-8"))
        except Exception as e:
            print("retry:", type(e).__name__)
    return None

def has_recurrence(rec):
    if not rec:
        return False
    if isinstance(rec, dict):
        return bool(rec.get("freq") or rec.get("days"))
    if isinstance(rec, str):
        s = rec.strip()
        return s not in ("", "{}", "null", "[]")
    return False

def visible(ev):
    if has_recurrence(ev.get("recurrence")):
        return True
    sd = (ev.get("start_date") or "")[:10]
    ed = (ev.get("end_date") or "")[:10]
    return (sd and sd >= TODAY) or (ed and ed >= TODAY)

GEO = {
    "Кипр": lambda c: "Кипр" in (c or ""),
    "Бали": lambda c: "Бали" in (c or "") or "Bali" in (c or ""),
    "Дананг": lambda c: "Дананг" in (c or ""),
    "Нячанг": lambda c: "Нячанг" in (c or ""),
}

def main():
    d = load()
    if not d:
        print("НЕ СКАЧАЛСЯ снапшот витрины"); return 1
    cards = d.get("cards") or d.get("events") or []
    print("снапшот:", d.get("generated_at"), "карточек:", len(cards), "сегодня:", TODAY)

    tot, vis = {}, {}
    for ev in cards:
        c = ev.get("city") or "(без города)"
        tot[c] = tot.get(c, 0) + 1
        if visible(ev):
            vis[c] = vis.get(c, 0) + 1

    print("\n--- ГОРОДА: всего / видно сегодня ---")
    rows = sorted(tot.items(), key=lambda kv: -kv[1])
    empty = []
    for c, n in rows:
        v = vis.get(c, 0)
        flag = "  << ПУСТ" if v == 0 else ""
        if v == 0:
            empty.append((c, n))
        print(f"{c:28s} {n:5d} / {v:5d}{flag}")

    print("\n--- ГЕОФОКУС ---")
    for name, pred in GEO.items():
        t = sum(1 for ev in cards if pred(ev.get("city")))
        v = sum(1 for ev in cards if pred(ev.get("city")) and visible(ev))
        print(f"{name:8s} всего {t:4d} / видно {v:4d}")

    print("\n--- ИТОГО ---")
    print("видно сегодня:", sum(vis.values()), "из", len(cards))
    print("городов с 0 видимых:", len(empty))
    for c, n in empty:
        print("   пуст:", c, f"(карточек {n})")
    return 0

if __name__ == "__main__":
    sys.exit(main())
