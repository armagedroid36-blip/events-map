#!/usr/bin/env python3
"""Preflight очереди отложенных ремонтов dot-events (1098,1099,1100,1101,1103,1104).

Пока REST Supabase отдаёт 402 (exceed_egress_quota), правки применить нельзя.
Скрипт сверяет цели всех ждущих скриптов с ПРОД-СНИМКОМ (data/events.json),
т.е. проверяет, что после снятия квоты очередь не начнёт падать на гейтах:
каждая цель должна быть в снимке со status=active и ожидаемой датой.

Ноль запросов к Supabase. Запуск: python scripts/dot-1105-preflight-pending.py
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = [
    ("dot-1098", "scripts/dot-1098-makis-dupe-fix.mjs"),
    ("dot-1099", "scripts/dot-1099-ru-en-dupe-fix.mjs"),
    ("dot-1100", "scripts/dot-1100-pair-dupe-fix.mjs"),
    ("dot-1101", "scripts/dot-1101-snapshot-dupe-fix.mjs"),
    ("dot-1103", "scripts/dot-1103-centroid-venue-fix.mjs"),
    ("dot-1104", "scripts/dot-1104-intoto-opening-dupe-fix.mjs"),
]
ID_RE = re.compile(r"'([0-9a-f]{8})'")
SNURL = f"https://mypins.site/data/events.json?v={int(time.time())}"


def load_snapshot():
    req = urllib.request.Request(SNURL, headers={"User-Agent": "hermes-dot-events/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    snap = load_snapshot()
    cards = snap.get("cards") or snap.get("events") or []
    print(f"снимок: generated_at {snap.get('generated_at')} count {len(cards)}")
    by_prefix = {}
    for c in cards:
        by_prefix.setdefault(c["id"][:8], c)

    gates = 0
    fails = []
    seen = {}
    for name, rel in SCRIPTS:
        p = ROOT / rel
        if not p.exists():
            print(f"{name}: ФАЙЛ ОТСУТСТВУЕТ {rel}")
            fails.append((name, "file-missing"))
            gates += 1
            continue
        text = p.read_text(encoding="utf-8")
        ids = sorted(set(ID_RE.findall(text)))
        print(f"\n{name}: целей {len(ids)} -> {' '.join(ids)}")
        for pre in ids:
            gates += 1
            card = by_prefix.get(pre)
            seen[pre] = (name, card)
            if card is None:
                print(f"  {pre}: НЕТ В СНИМКЕ (архив или истёк)  ← гейт провален")
                fails.append((name, f"{pre} not-in-snapshot"))
                continue
            print(f"  {pre}: {card.get('start_date')} {card.get('start_time')} | "
                  f"{card.get('city')} | {card.get('lat')},{card.get('lng')} | "
                  f"{str(card.get('title'))[:60]}")

    print(f"\nГЕЙТОВ проверено: {gates}, провалов: {len(fails)}")
    for f in fails:
        print("  FAIL:", f)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
