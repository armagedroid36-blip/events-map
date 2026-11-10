#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""probe-848: дубли по ТРОЙКЕ «одна точка площадки (<=150 м) + общая тема названия + ПЕРЕСЕЧЕНИЕ дат».
Все прошлые зонды требовали ОДНОЙ start_date (или Δ=1 день). Класс «одна и та же запись источника
пришла с интервалом и без него / с разными датами окна» ими не виден.
Офлайн по прод-снапшоту, базу не трогает (работает при 402).
"""
import json, os, re, sys, itertools, unicodedata

SNAP = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Temp', 'prod-845.json')

STOP = set("""event events concert concerts festival festival2026 show shows party night nights live
music dance theatre theater театр концерт вечер вечеринка фестиваль выставка показ спектакль встреча
workshop мастер класс лекция ярмарка market christmas рождественская рождественский новогодняя
программа programme program dates дата расписание village деревня city город island
bali cyprus кипр бали nha trang нячанг da nang дананг limassol nicosia larnaca paphos
лемесос никсия никосия ларнака пафос paralimni protaras ayia napa фамагуста
sunday monday tuesday wednesday thursday friday saturday воскресенье суббота пятница
2026 2027 edition edition2026 annual international""".split())

def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    s = s.replace('ё', 'е')
    return s

def words(s):
    s = norm(s)
    s = re.sub(r'[^0-9a-z\u0370-\u03ff\u0400-\u04ff]+', ' ', s)
    out = set()
    for w in s.split():
        if len(w) < 5 or w in STOP or w.isdigit():
            continue
        # грубая нормализация окончаний RU
        if len(w) > 7 and w[-1] in 'аеиоуыяюь':
            w = w[:-1]
        out.add(w)
    return out

def titles(c):
    return [t for t in (c.get('title'), c.get('title_ru'), c.get('title_en')) if t]

def d(x):
    return x or ''

def overlap(a1, a2, b1, b2):
    a2 = a2 or a1; b2 = b2 or b1
    return not (a2 < b1 or b2 < a1)

def main():
    data = json.load(open(SNAP, encoding='utf-8'))
    cards = data.get('cards') or data.get('events') or []
    print('карточек в снапшоте:', len(cards))
    grid = {}
    for c in cards:
        lat, lng = c.get('lat'), c.get('lng')
        if lat is None or lng is None:
            continue
        if not c.get('start_date'):
            continue
        grid.setdefault((round(lat, 3), round(lng, 3)), []).append(c)

    multi = {k: v for k, v in grid.items() if len(v) > 1}
    pairs_total = sum(len(v) * (len(v) - 1) // 2 for v in multi.values())
    print('групп по точке >1:', len(multi), '| пар внутри групп:', pairs_total)

    leads = []
    for (glat, glng), group in multi.items():
        for a, b in itertools.combinations(group, 2):
            if a.get('recurrence') or b.get('recurrence'):
                continue
            if not overlap(d(a.get('start_date')), d(a.get('end_date')),
                           d(b.get('start_date')), d(b.get('end_date'))):
                continue
            wa, wb = set(), set()
            for t in titles(a): wa |= words(t)
            for t in titles(b): wb |= words(t)
            common = wa & wb
            if len(common) < 2:
                continue
            leads.append({
                'a': a.get('id', '')[:8], 'b': b.get('id', '')[:8],
                'title_a': (a.get('title') or '')[:60], 'title_b': (b.get('title') or '')[:60],
                'date_a': f"{a.get('start_date')}..{d(a.get('end_date'))}",
                'date_b': f"{b.get('start_date')}..{d(b.get('end_date'))}",
                'time_a': a.get('start_time'), 'time_b': b.get('start_time'),
                'city_a': a.get('city'), 'city_b': b.get('city'),
                'addr_a': (a.get('address') or '')[:45], 'addr_b': (b.get('address') or '')[:45],
                'common': sorted(common),
            })
    # одинаковые даты — это класс dupes-822, отделяем
    same = [l for l in leads if l['date_a'] == l['date_b']]
    diff = [l for l in leads if l['date_a'] != l['date_b']]
    print('лидов всего:', len(leads), '| даты интервала РАЗНЫЕ:', len(diff), '| даты совпали (класс 822):', len(same))
    for l in diff:
        print('---')
        print(f"{l['a']} «{l['title_a']}» {l['date_a']} {l['time_a']} | {l['city_a']} | {l['addr_a']}")
        print(f"{l['b']} «{l['title_b']}» {l['date_b']} {l['time_b']} | {l['city_b']} | {l['addr_b']}")
        print('   общие слова:', ', '.join(l['common']))
    outp = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Temp', 'leads-vendor-848.json')
    json.dump(leads, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('лид-файл:', outp)

if __name__ == '__main__':
    main()
