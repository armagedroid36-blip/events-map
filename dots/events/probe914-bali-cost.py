#!/usr/bin/env python
"""probe914-bali-cost.py — цена простоя сбора для БАЛИ (вопрос 911/913, теперь по Балифоруму).

Берёт ленту Балифорума в режиме upcoming (`defaultList=1`, 2 страницы, 113 записей) через
прокси 10809, оставляет события с будущей датой (`eventDates[].startAt`) и сверяет с
прод-снапшотом `data/events.json` (ключ `cards`, Бали-карточки по метке города).

Совпадение карточки: >=2 общих значимых слова названия ИЛИ одно общее слово, покрывающее
>=60% слов названия (однословные события: «Гвоздетерапия», «Гвоздестояние»).
Дата НЕ требуется: у регулярных серий карточка уже есть, а лента отдаёт следующий показ.

Замер 15.11.2026: лента upcoming 113 событий (макс. дата 14.12.2027), из них 104 уже
представлены карточкой (регулярные серии с прошедшей start_date или та же серия),
НОВЫХ 9 — 6 досуговых событий 15–22.11 (бранч с Т-игрой, Женская Баня, Киноклуб, скетчи,
гитарный вечер, рисование на пляже) + 3 конференции 13–14.12.2027 (вне горизонта сбора).

ВЫВОД (для стратегии разблокировки): Бали даёт единицы новых карточек за прогон, а не
десятки как Вьетнам (32), потому что длинные регулярные серии уже собраны; горизонт ленты
до декабря 2027 ничего не значит — сбор режет `DAYS_AHEAD` 90.

Запуск: python probe914-bali-cost.py (нужен прокси 10809; снапшот положить в %TEMP%\\prod-914.json)
"""
import json, os, re, subprocess, datetime

T = os.environ.get("LOCALAPPDATA", r"C:\Users\armag\AppData\Local") + r"\Temp"
TODAY = datetime.date.today()
PROXY = "http://127.0.0.1:10809"
STOP = set("для как что это его она они там тут уже ещё есть был была будут будет или под над при без про через очень можно нужно весь вся все свой своя the and for with from".split())
BALI = ('Бали', 'Убуд', 'Чангу', 'Кута', 'Семиньяк', 'Санур', 'Денпасар', 'Джимбаран', 'Легиан',
        'Табанан', 'Амед', 'Сидемен', 'Ловина', 'Печату', 'Нуса', 'Керобокан', 'Тегалаланг',
        'Кутух', 'Чандидаса', 'Чемаги', 'Далунг', 'Переренан')


def nrm(t):
    return {w for w in re.findall(r'[a-zа-яёA-ZА-ЯЁ0-9]{4,}', (t or '').lower()) if w not in STOP}


def feed():
    out = []
    for page in (1, 2):
        f = os.path.join(T, f"bf-{page}.json")
        subprocess.run(['curl', '-s', '-x', PROXY, '--max-time', '30',
                        f'https://baliforum.ru/api/v1/events?defaultList=1&pageSize=100&page={page}',
                        '-o', f], check=False)
        try:
            out += json.load(open(f, encoding='utf-8'))['data']
        except Exception as e:
            print(f"[warn] page {page}: {e}")
    return out


def fdates(e):
    res = []
    for d in (e.get('eventDates') or []):
        m = re.match(r'(\d{4})-(\d{2})-(\d{2})', d.get('startAt') or '')
        if m:
            res.append(datetime.date(*map(int, m.groups())))
    return sorted({x for x in res if x >= TODAY})


def card_for(t, bali):
    for c in bali:
        com = t & (nrm(c.get('title')) | nrm(c.get('title_ru') or ''))
        if len(com) >= 2 or (com and t and len(com) / len(t) >= 0.6):
            return c, com
    return None, set()


def main():
    snap = os.path.join(T, 'prod-914.json')
    cards = json.load(open(snap, encoding='utf-8'))['cards']
    bali = [c for c in cards if any(b in (c.get('city') or '') for b in BALI)]
    ev = feed()
    fut, on_map, new = 0, 0, []
    for e in ev:
        ds = fdates(e)
        if not ds:
            continue
        fut += 1
        c, _ = card_for(nrm(e.get('title')), bali)
        if c:
            on_map += 1
        else:
            new.append((ds[0], e.get('title'), (e.get('place') or {}).get('title')))
    print(f"снапшот: карточек {len(cards)}, Бали {len(bali)}; лента upcoming {len(ev)}, с будущей датой {fut}")
    print(f"уже представлено карточкой: {on_map}; НОВЫХ: {len(new)}")
    for n in sorted(new):
        print(' ', n[0], '|', re.sub(r'&[a-zA-Z#0-9]+;', '', n[1] or '')[:52], '|', (n[2] or '-')[:22])


if __name__ == '__main__':
    main()
