#!/usr/bin/env python
"""probe913-vn-recovery.py — сколько событий Вьетнама реально ждёт разблокировки сбора.

Читает живые ленты TG-каналов (nyachang_ru, danang_afisha) через локальный прокси 10809,
берёт посты с БУДУЩЕЙ датой (>= сегодня) и сверяет их с прод-снапшотом data/events.json
(ключ снапшота — `cards`, не `events`).

Вывод по городу: постов с будущей датой / карточек города в снапшоте / сколько постов
НЕ представлено карточкой (совпадение = та же дата + >=2 общих значимых слова названия).

Замер 15.11.2026: Нячанг 15/58/15, Дананг 17/27/17, макс. дата в лентах 22.11 и 21.11
=> ленты публикуют максимум на ~7 дней вперёд, горизонт Вьетнама короткий ПО ДИЗАЙНУ.

Запуск: python probe913-vn-recovery.py  (нужен прокси 10809 для t.me)
"""
import re, os, html, json, datetime, subprocess

T = os.environ.get("LOCALAPPDATA", r"C:\Users\armag\AppData\Local") + r"\Temp"
TODAY = datetime.date.today()
MON = {'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'мая': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12}
STOP = set('для как что это его она они там тут уже ещё есть был была будут будет или под над при без про через очень можно нужно весь вся все свой своя'
           .split())
SNAP = os.path.join(T, 'prod-913.json')
CHANNELS = [('nyachang_ru', 'Нячанг'), ('danang_afisha', 'Дананг')]


def fetch(username):
    out = os.path.join(T, f'tg-{username}.html')
    subprocess.run(['curl', '-s', '-x', 'http://127.0.0.1:10809', '--max-time', '25',
                    '-A', 'Mozilla/5.0', f'https://t.me/s/{username}', '-o', out], check=False)
    return out


def dates_in(text):
    res = []
    for m in re.finditer(r'\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b', text):
        d, mo = int(m.group(1)), int(m.group(2))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            res.append(datetime.date(TODAY.year, mo, d))
    for m in re.finditer(r'\b(\d{1,2})\s+(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)', text, re.I):
        d = int(m.group(1)); mo = MON[m.group(2)[:3].lower()]
        if 1 <= d <= 31:
            res.append(datetime.date(TODAY.year, mo, d))
    return res


def nrm(t):
    return {w for w in re.findall(r'[a-zа-яёA-ZА-ЯЁ0-9]{4,}', (t or '').lower()) if w not in STOP}


def main():
    cards = json.load(open(SNAP, encoding='utf-8'))['cards']
    total = 0
    for username, city in CHANNELS:
        s = open(fetch(username), encoding='utf-8', errors='ignore').read()
        posts = []
        for b in s.split('<div class="tgme_widget_message_wrap')[1:]:
            tm = re.search(r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', b, re.S)
            pid = re.search(r'data-post="([^"]+)"', b)
            if not tm or not pid:
                continue
            txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', tm.group(1)))).strip()
            ds = [d for d in dates_in(txt) if d >= TODAY]
            if ds:
                posts.append((pid.group(1), min(ds), txt))
        cand = [c for c in cards if (c.get('city') or '').startswith(city)]
        new = []
        for pid, d, txt in posts:
            w = nrm(txt)
            if any((c.get('start_date') or '')[:10] == d.isoformat() and
                   len(w & (nrm(c.get('title')) | nrm(c.get('title_ru')) | nrm(c.get('title_en')))) >= 2
                   for c in cand):
                continue
            new.append((d, pid, txt[:50]))
        total += len(new)
        print(f'{city}: постов с будущей датой {len(posts)}, карточек в снапшоте {len(cand)}, не на карте {len(new)},'
              f' макс. дата {max(d for _, d, _ in posts) if posts else "-"}')
        for d, pid, t in sorted(new)[:5]:
            print(f'   {d} {pid} {t}')
    print('ИТОГО новых событий в лентах Вьетнама, ждущих разблокировки:', total)


if __name__ == '__main__':
    main()
