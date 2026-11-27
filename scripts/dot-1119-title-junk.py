#!/usr/bin/env python
"""Офлайн-замер класса «мусор в НАЗВАНИИ карточки» (0 запросов к Supabase).

Класс впервые измерен в запуске 1119: в названии может торчать хвост
TG-поста — хэштег, ссылка, телефон, цена, служебный ярлык («Регистрация»,
«Билеты»), эмодзи, двойная пунктуация, дубль адреса, хвостовая запятая.
Проверяются все алиасы: title / title_ru / title_en.

Ложные срабатывания, отсечённые правилами (замер 1119, 1430 карточек):
  - «Women in Wine #3» — номер выпуска серии, не хэштег (хэштег = буква, не цифра);
  - «ПРИРОДА КОНФЛИКТОВ» / «Надену рубашку» — слова «цена»/«руб» внутри обычной речи
    (цена/валюта считаются мусором только рядом с числом или двоеточием);
  - «Black Friday...» и «DISSOLVE :: PLAY» — многоточие и «::» в бренде законны.

Снимок тянем с ?v=<epoch> (CDN max-age=600 иначе отдаёт старый).
Запуск: python scripts/dot-1119-title-junk.py
"""
import json, re, time, urllib.request, collections

SNAP = "https://mypins.site/data/events.json?v=%d"

HASH = re.compile(r"(^|\s)#[A-Za-zА-Яа-яЁё][0-9A-Za-zА-Яа-яЁё_]*")
URL = re.compile(r"(https?://|www\.|t\.me/|maps\.app\.goo\.gl)", re.I)
PHONE = re.compile(r"\+?\d[\d\s\-()]{8,}\d")
# цена/валюта — только как «цена: 500», «$20», «500 руб», «200 000 đ»
MONEY = re.compile(r"(₽|\$|€)\s*\d|\bцена\b\s*[:\-—]|\bprice\b\s*:|\d\s*(руб\.?|rub|vnd|đ|idr)\b", re.I)
SERVICE = re.compile(r"^(регистрация|запись|билеты?|вход|подробности|анонс)\b", re.I)
# повторная пунктуация «!!», «??», «,,», «;;» и края — но НЕ «...» и НЕ «::»
PUNCT = re.compile(r"([!?,;])\1+|^[\s\-–—|•·.,:;]+|[\s\-–—|•·,:;]+$")
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]")

CASES = [
    # (строка, секция-ожидание или None) — контроль «сенсор не ослеп»
    ("Женщины в виноделии #3 в Никосии", None),
    ("ПРИРОДА КОНФЛИКТОВ И ИХ СЦЕНАРИИ", None),
    ("Надену рубашку любви в Ларнаке", None),
    ("Black Friday... with a Xmas Twist", None),
    ("DISSOLVE :: PLAY", None),
    ("Запись на мастер-класс по керамике", "E"),
    ("Билеты: https://t.me/chan/12", "B"),
    ("Вечер джаза #АфишаДананга", "A"),
    ("Концерт в 20:00", None),
    ("Цена: 500000 vnd", "D"),
    ("— Квиз в четверг —", "F"),
    ("Йога!! Нячанг", "F"),
    ("Звонить +7 999 123-45-67", "C"),
    ("Вечеринка 🎉 на закате", "G"),
]


def load():
    req = urllib.request.Request(SNAP % int(time.time()), headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=45).read().decode())
    return d, d.get("cards") or []


def sections(v):
    out = []
    if HASH.search(v):
        out.append("A")
    if URL.search(v):
        out.append("B")
    if PHONE.search(v):
        out.append("C")
    if MONEY.search(v):
        out.append("D")
    if SERVICE.search(v):
        out.append("E")
    if PUNCT.search(v):
        out.append("F")
    if EMOJI.search(v):
        out.append("G")
    return out


def self_check():
    ok = 0
    for text, want in CASES:
        got = sections(text)
        if (want is None and not got) or (want and want in got):
            ok += 1
        else:
            print(f"  ПРОВАЛ контроля: «{text}» ожидали {want}, получили {got}")
    print(f"контроль сенсора: {ok}/{len(CASES)}")
    return ok == len(CASES)


def main():
    check = self_check()
    d, cards = load()
    print(f"снимок generated_at={d.get('generated_at')} карточек={len(cards)}")
    hits = collections.defaultdict(list)
    for c in cards:
        names = {k: c.get(k) for k in ("title", "title_ru", "title_en") if c.get(k)}
        addr = (c.get("address") or "").strip().lower()
        for field, val in names.items():
            v = val.strip()
            for s in sections(v):
                hits[s].append((c["id"][:8], field, v))
            if addr and len(addr) > 6 and v.lower() == addr:
                hits["H"].append((c["id"][:8], field, v))
            if re.search(r"[,;]\s*$", v):
                hits["I"].append((c["id"][:8], field, v))

    if not hits:
        print("дефектов 0 по всем секциям")
    for k in sorted(hits):
        rows = hits[k]
        print(f"\n{k}: строк {len(rows)}, карточек {len({r[0] for r in rows})}")
        for r in rows[:8]:
            print("   ", r[0], r[1], "|", r[2][:110])
    if not check:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
