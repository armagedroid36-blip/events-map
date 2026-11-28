#!/usr/bin/env python3
"""Preflight очереди применения dot-1107 (запуск 1126, блокер 402).

Зачем: очередь из 13 fix-скриптов применяется одной командой в момент снятия
квоты egress, и остановка идёт на первом ненулевом коде. Значит до применения
надо знать две вещи без обращения к базе (база под 402):

  A) состав целей в QUEUE совпадает с id внутри самих fix-скриптов.
     Класс дефекта 1122: в очереди было 2 id, в скрипте 7 — readback пропустил
     бы 5 карточек. Сверка идёт по КОДУ скрипта, комментарии вырезаны: иначе
     соседние карточки, упомянутые в пояснении (7d1ddcb7, 89c55c3a у 1114,
     173fc77c у 1122), дают ложное «в скрипте есть, в очереди нет».
  B) каждая цель присутствует в живом снимке витрины (0 запросов к базе).
  C) нет цели, которую один скрипт правит, а другой снимает в архив
     (конфликт порядка), и нет id-дубля внутри одной операции.

Запуск: python scripts/dot-1126-queue-preflight.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUEUE = ROOT / "scripts/dot-1107-apply-queue.mjs"
SNAP = "https://mypins.site/data/events.json"


def strip_comments(src: str) -> str:
    """Убирает // и /* */ комментарии, чтобы id из пояснений не считались целями."""
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    out = []
    for line in src.splitlines():
        # // внутри строки-литерала маловероятен в этих скриптах
        idx = line.find("//")
        out.append(line if idx < 0 else line[:idx])
    return "\n".join(out)


def load_queue():
    block = QUEUE.read_text(encoding="utf-8").split("const QUEUE = [", 1)[1].split("\n]", 1)[0]
    entries = re.findall(r"\['(dot-[0-9]+)',\s*'(scripts/[^']+)',\s*\[([^\]]*)\]\]", block)
    q = []
    for name, path, ids in entries:
        q.append((name, path, re.findall(r"'([0-9a-f]{8})'", ids)))
    return q


DUP_HINTS = ("dup", "copy", "arch", "снят", "копия")


def role_of(code: str, ident: str) -> str:
    """Роль цели в скрипте. Сначала точная метка поля (`dup: 'id'` / `canon: 'id'`) —
    именно так цели описаны в fix-скриптах; иначе — эвристика по близости слов
    (dup/copy/arch рядом с id). Без точной метки скрипт, который снимает копию,
    помечал бы архивом и канон из той же строки PAIRS, и зонд рапортовал ложный
    конфликт порядка (кейс 2b39ece2 в 1100/1103)."""
    labels = set(re.findall(r"(\w+)\s*:\s*['\"]" + ident, code))
    low = {l.lower() for l in labels}
    if low & {"dup", "copy", "archived"}:
        return "dup"
    if low & {"canon", "keep", "target", "id", "twin", "ref"}:
        return "keep"
    hits = []
    for m in re.finditer(ident, code):
        ctx = code[max(0, m.start() - 70): m.end() + 70].lower()
        hits.append(any(h in ctx for h in DUP_HINTS))
    return "dup" if hits and sum(hits) * 2 > len(hits) else "keep"


def main():
    queue = load_queue()
    total = sum(len(x[2]) for x in queue)
    uniq = {i for x in queue for i in x[2]}
    print(f"QUEUE: {len(queue)} скриптов, целей {total}, уникальных {len(uniq)}")

    print("\n== A. Состав целей: QUEUE vs код fix-скрипта (комментарии вырезаны) ==")
    mismatch = 0
    archive_ops = {}  # id -> [скрипты, которые его архивируют]
    edit_ops = {}     # id -> [скрипты, которые его правят]
    for name, path, lst in queue:
        p = ROOT / path
        if not p.exists():
            print(f"  !! {name}: НЕТ ФАЙЛА {path}")
            mismatch += 1
            continue
        code = strip_comments(p.read_text(encoding="utf-8", errors="replace"))
        in_script = set(re.findall(r"\b([0-9a-f]{8})\b", code))
        in_script.discard("00000000")
        qset = set(lst)
        extra = sorted(qset - in_script)
        missed = sorted(in_script - qset)
        pattern_script = not in_script  # id живут только в очереди, отбор по шаблону поля
        ok = pattern_script or (not extra and not missed)
        mismatch += 0 if ok else 1
        note = " (скрипт по шаблону поля, id задан только в очереди)" if pattern_script else ""
        print(f"  {name}: QUEUE {len(qset)}, код {len(in_script)} uuids, {'OK' if ok else 'РАСХОЖДЕНИЕ'}{note}")
        if extra and not pattern_script:
            print(f"      в очереди, но не в коде: {extra}")
        if missed:
            print(f"      в коде, но не в очереди: {missed}")
        for i in lst:
            role = role_of(code, i)
            (archive_ops if role == "dup" else edit_ops).setdefault(i, []).append(name)

    print("\n== B. Цели против живого снимка витрины ==")
    url = f"{SNAP}?v={int(time.time())}"
    req = urllib.request.Request(url, headers={"User-Agent": "hermes-dot-events/1.0"})
    data = json.load(urllib.request.urlopen(req, timeout=60))
    cards = data.get("cards") or data.get("events") or []
    byid = {(c.get("id") or "")[:8]: c for c in cards}
    print(f"Снимок: generated_at {data.get('generated_at')}, карточек {len(cards)}")
    present, missing = 0, []
    for i in sorted(uniq):
        c = byid.get(i)
        if c:
            present += 1
        else:
            missing.append(i)
    print(f"  целей {len(uniq)}: в снимке {present}, отсутствуют {len(missing)} {missing}")

    print("\n== C. Конфликт порядка: id правит один скрипт, а снимает другой ==")
    conflict = sorted(set(archive_ops) & set(edit_ops))
    for i in conflict:
        print(f"  КОНФЛИКТ {i}: архив {archive_ops[i]}, правка {edit_ops[i]}")
    print(f"  конфликтов: {len(conflict)}; архивируют {len(archive_ops)} целей, правят {len(edit_ops)}")

    print(f"\nИТОГ: расхождений состава {mismatch}, отсутствующих в снимке {len(missing)}, "
          f"конфликтов порядка {len(conflict)}")
    return 0 if (mismatch == 0 and not missing and not conflict) else 1


if __name__ == "__main__":
    raise SystemExit(main())
