# -*- coding: utf-8 -*-
"""probe-875: пин карточки лежит в ГОРОДСКОМ БОКСЕ ЧУЖОГО города при непустом адресе.

Класс: city карточки называет один город, а пин стоит у центра другого (не «в 45 км от своего»,
а именно «ближе 1 км к чужому центру и на >=3 км ближе, чем к своему»).
Центр города = медиана пинов его карточек (города с >=5 карточками), т.к. снапшот не хранит bbox.

Приёмка (14.11.2026, снапшот 08.11): боевой прогон — 0 кандидатов на 1090 кипрских карточках,
CTL=1 (два пина Никосии подменены на точку Пафоса) — 2 кандидата по 95.6 км ⇒ зонд не слепой.
Класс на снапшоте закрыт; повторно не гонять без свежего снапшота.

Запуск: python probe-875-citybox.py           (снапшот prod-875.json в %LOCALAPPDATA%\\Temp)
        CTL=1 python probe-875-citybox.py     (контроль)
"""
import json, os, math, collections, sys

SNAP = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'prod-875.json')
CTL = os.environ.get('CTL') == '1'


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*6371*math.asin(math.sqrt(h))


def centers(cards):
    by = collections.defaultdict(list)
    for c in cards:
        try:
            by[c.get('city') or ''].append((float(c['lat']), float(c['lng'])))
        except Exception:
            continue
    out = {}
    for city, pts in by.items():
        if len(pts) >= 5:
            la = sorted(x[0] for x in pts)
            lo = sorted(x[1] for x in pts)
            out[city] = (la[len(la)//2], lo[len(lo)//2])
    return out


def scan(cards):
    cent = centers(cards)
    res = []
    for c in cards:
        if 'ипр' not in (c.get('city') or ''):
            continue
        try:
            p = (float(c['lat']), float(c['lng']))
        except Exception:
            continue
        own = c.get('city')
        if own not in cent:
            continue
        d_own = km(p, cent[own])
        best = min(((km(p, q), n) for n, q in cent.items() if n != own), default=None)
        if not best:
            continue
        dist, name = best
        if dist < 1.0 and d_own - dist >= 3.0:
            res.append((round(d_own-dist, 1), c['id'][:8], own, name,
                        (c.get('address') or '')[:40], (c.get('title') or '')[:45], c.get('start_date')))
    return sorted(res, reverse=True)


def main():
    d = json.load(open(SNAP, encoding='utf-8'))
    cards = d['cards']
    print('карточек:', len(cards), '| generated_at:', d.get('generated_at'))
    if CTL:
        n = 0
        cards = [dict(c) for c in cards]
        for c in cards:
            if c.get('city') == 'Никосия, Кипр' and n < 2:
                c['lat'], c['lng'] = 34.7782, 32.4232
                n += 1
        print('РЕЖИМ: контроль (2 пина Никосии -> Пафос)')
    res = scan(cards)
    print('кандидатов:', len(res))
    for r in res:
        print(r)


if __name__ == '__main__':
    main()
