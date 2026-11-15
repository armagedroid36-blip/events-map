#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""probe911: цена простоя сбора по витрине (прод-снапшот events.json).

Вопрос: снапшот gen 08.11, сбор стоит (REST 402). Что и когда просядет на карте,
если новых данных не будет? Считаем «видимые» карточки на контрольные даты:
карточка видна, если start_date >= D, либо end_date >= D (идёт), либо у неё есть
recurrence (регулярное шоу — фронт считает ближайшую дату от сегодня).

Запуск: python dots/events/probe911-depletion.py [path-to-events.json]
"""
import json
import io
import sys
from collections import defaultdict

PATH = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/armag/AppData/Local/Temp/prod-911.json"
TODAY = "2026-11-15"
CHECKS = ["2026-11-15", "2026-11-22", "2026-11-30", "2026-12-07",
          "2026-12-14", "2026-12-21", "2026-12-31", "2027-01-15", "2027-02-15"]


def d(x):
    return (x or "")[:10]


def main():
    data = json.load(io.open(PATH, encoding="utf-8"))
    cards = data["cards"]
    print("снапшот: %s, карточек %d" % (data.get("generated_at"), len(cards)))

    rec = [c for c in cards if c.get("recurrence")]
    print("с recurrence (регулярные, не гаснут): %d" % len(rec))

    # 1. кривая видимости по датам
    print("\n-- видимых карточек на дату --")
    prev = None
    for D in CHECKS:
        n = sum(1 for c in cards
                if d(c.get("start_date")) >= D
                or d(c.get("end_date")) >= D
                or c.get("recurrence"))
        delta = "" if prev is None else "  (%+d)" % (n - prev)
        print("%s  %4d%s" % (D, n, delta))
        prev = n

    # 2. по городам: сколько видно сегодня / к 22.11 / к 14.12
    def visible_at(city_cards, D):
        return sum(1 for c in city_cards
                   if d(c.get("start_date")) >= D
                   or d(c.get("end_date")) >= D
                   or c.get("recurrence"))

    by_city = defaultdict(list)
    for c in cards:
        by_city[(c.get("city") or "?").split(",")[0].strip()].append(c)

    print("\n-- города: видно сегодня / 22.11 / 14.12 / последняя дата в городе --")
    rows = []
    for city, lst in by_city.items():
        today_n = visible_at(lst, TODAY)
        if today_n == 0:
            continue
        last = max((d(c.get("end_date")) or d(c.get("start_date"))) for c in lst)
        rows.append((today_n, city, len(lst), visible_at(lst, "2026-11-22"),
                     visible_at(lst, "2026-12-14"), last))
    rows.sort(reverse=True)
    for today_n, city, total, v22, v14, last in rows:
        print("%-18s всего %4d | сегодня %4d | 22.11 %4d | 14.12 %4d | до %s"
              % (city, total, today_n, v22, v14, last))

    # 3. геофокус: когда в регионе не останется видимых
    focus = {
        "Бали": lambda c: "Бали" in (c.get("city") or "") or "Bali" in (c.get("city") or ""),
        "Дананг": lambda c: "Дананг" in (c.get("city") or ""),
        "Нячанг": lambda c: "Нячанг" in (c.get("city") or ""),
        "Кипр": lambda c: "Кипр" in (c.get("city") or "") or "Cyprus" in (c.get("city") or ""),
    }
    print("\n-- геофокус: видимых по контрольным датам --")
    for name, f in focus.items():
        lst = [c for c in cards if f(c)]
        hist = " ".join("%s:%d" % (D[5:], visible_at(lst, D)) for D in CHECKS)
        print("%-8s всего %4d | %s" % (name, len(lst), hist))


if __name__ == "__main__":
    main()
