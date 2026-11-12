#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Зонд 851: закрытие двух лидов 848 (арбитры сняты, правок не требуется).
  1) 78b37521 «Maxim Galkin | Anniversary Concert “50!”» 14.11 20:00 -> 15.11 20:00 (Pattichio)
     vs acdc40a1 «МАКСИМ ГАЛКИН» 15.11 16:00 (Pattihio Municipal Theatre)
  2) 3845e750 «Lefkara Classic 2026 – 12-15.11.2026» 12.11 16:00 -> 15.11 17:00
     vs 46b40644 «Lefkara Classic 2026» 15.11 06:30

Вердикты (арбитры записаны в файле, повторно не искать):
  Галкин — в Лимасоле ТРИ выступления Pattihio: 14.11 20:00, 15.11 20:00 (оба sold out)
  и extra show 15.11 16:00 (FridayTicket: «15 ноября 2026 | 16:00 Лимасол | Pattihio Theatre»).
  Интервал 14.11 20:00 -> 15.11 20:00 описывает два вечера в 20:00, отдельная карточка 16:00 —
  третье выступление. НЕ дубль, обе карточки верны.
  Lefkara Classic — источник Cyprus Now держит ДВЕ независимые записи:
  `lefkara-classic-2026-15-11-2026-2026-11-15` (12.11 14:00Z -> 15.11 15:00Z = 16:00 -> 17:00)
  и `lefkara-classic-endurance-cycling-challenge-in-lefkara-2026-11-15` (15.11 04:30Z = 06:30).
  Окно события и старт гонки — разные записи источника. НЕ дубль, обе оставить.

Запуск: python probe-leads-851.py [путь к снапшоту]
Без БД (REST в блоке квоты 402).
"""
import json
import os
import sys

LEADS = {
    "78b37521": {
        "pair": "acdc40a1",
        "verdict": "no-dupe",
        "arbiter": "FridayTicket/Instagram: три выступления Pattihio Limassol — 14.11 20:00, 15.11 20:00 (+extra 15.11 16:00)",
    },
    "3845e750": {
        "pair": "46b40644",
        "verdict": "no-dupe",
        "arbiter": "лента Cyprus Now: две независимые записи (окно 12.11 14:00Z->15.11 15:00Z и старт 15.11 04:30Z)",
    },
}


def default_snapshot():
    return os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp", "prod-851.json")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else default_snapshot()
    d = json.load(open(path, encoding="utf-8"))
    cards = d.get("cards") or []
    bypref = {}
    for c in cards:
        bypref.setdefault(str(c.get("id", ""))[:8], []).append(c)
    print("снапшот: %s карточек, generated_at %s" % (len(cards), d.get("generated_at")))
    missing = 0
    for pref, info in LEADS.items():
        a = bypref.get(pref) or []
        b = bypref.get(info["pair"]) or []
        if len(a) != 1 or len(b) != 1:
            missing += 1
            print("MISS %s/%s (%d/%d)" % (pref, info["pair"], len(a), len(b)))
            continue
        a, b = a[0], b[0]
        print("\n%s %s" % (pref, a.get("title")))
        print("   %s %s -> %s %s | %s | %s" % (a.get("start_date"), a.get("start_time"), a.get("end_date"),
                                               a.get("end_time"), a.get("address"), a.get("city")))
        print("%s %s" % (info["pair"], b.get("title")))
        print("   %s %s -> %s %s | %s | %s" % (b.get("start_date"), b.get("start_time"), b.get("end_date"),
                                               b.get("end_time"), b.get("address"), b.get("city")))
        print("   вердикт: %s — %s" % (info["verdict"], info["arbiter"]))
    print("\nправок в базе: 0 (оба лида законны), отсутствующих карточек: %d" % missing)
    return 0


if __name__ == "__main__":
    sys.exit(main())
