#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""probe-titlepair-857.py — офлайн-зонд по прод-снапшоту:
внутренние расхождения названий ОДНОЙ карточки: title vs title_ru / title_en.

Классы:
A) ЧИСЛА: набор цифровых токенов в title и в title_ru/title_en расходится
   (номера эпизодов/томов/частей, годы, "Vol 2" ↔ "Том 3").
B) ГОРОДА: в title_ru/EN назван город, которого нет в title, и он НЕ равен городу карточки
   (перевод описывает событие другого города).
C) ПУСТОЙ/ДУБЛЬ: title_ru == title буквально (перевода нет — не дефект, но считаем).
Без БД, только снапшот.
"""
import json, os, re, sys, unicodedata

SNAP = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Temp', 'prod-856.json')

CITY_WORDS = {
    'никосия': ['nicosi', 'lefkos', 'λευκωσ'], 'лимасол': ['limassol', 'lemes', 'λεμεσ'],
    'ларнака': ['larnaca', 'larnak', 'λαρνακ'], 'пафос': ['paphos', 'pafos', 'παφο'],
    'паралимни': ['paralimni', 'παραλιμν'], 'ая-напа': ['ayia napa', 'agia napa', 'αγία ναπ'],
    'протарас': ['protaras', 'πρωταρ'], 'фамагуста': ['famagusta', 'αμμόχωστ'],
    'денпасара': ['denpasar'], 'кута': ['kuta'], 'убуд': ['ubud'], 'чангу': ['canggu', 'чангу'],
    'семиньяк': ['seminyak'], 'санур': ['sanur'], 'джимбаран': ['jimbaran'],
    'нячанг': ['nha trang', 'нячанг'], 'дананг': ['da nang', 'danang', 'дананг'],
}

def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    s = s.replace('ё', 'е')
    return s

def nums(s):
    return set(re.findall(r'\d+', norm(s)))

def cities(s):
    t = norm(s)
    out = set()
    for ru, lat in CITY_WORDS.items():
        for v in lat + [ru]:
            if v in t:
                out.add(ru)
    return out

def main():
    data = json.load(open(SNAP, encoding='utf-8'))
    evs = data.get('cards') or data.get('events') or []
    print('снапшот: %d карточек' % len(evs))
    have_pair = 0
    A, B, C = [], [], []
    for e in evs:
        t = e.get('title') or ''
        tr = e.get('title_ru') or ''
        te = e.get('title_en') or ''
        if not t:
            continue
        for fld, other in (('title_ru', tr), ('title_en', te)):
            if not other:
                continue
            have_pair += 1
            on = norm(other)
            if on == norm(t):
                C.append(e)
                continue
            n1, n2 = nums(t), nums(other)
            if n1 and n2 and n1 != n2 and not (n1 & n2):
                A.append((e, fld, t, other, sorted(n1), sorted(n2)))
            c_other = cities(other)
            c_title = cities(t)
            city_card = norm(e.get('city') or '')
            for c in c_other - c_title:
                if c not in city_card:
                    B.append((e, fld, t, other, c, e.get('city')))
                    break
    print('пар названий: %d' % have_pair)
    print('\n=== A) числа расходятся: %d ===' % len(A))
    for e, fld, t, other, n1, n2 in A[:25]:
        print('%s | %-8s | %s | %s ||RU %s  [%s] vs [%s]' % (e.get('id', '')[:8], e.get('start_date'), t[:60], fld, other[:60], ','.join(n1), ','.join(n2)))
    print('\n=== B) город в переводе, чуждый карточке: %d ===' % len(B))
    for e, fld, t, other, c, city in B[:25]:
        print('%s | %s | city=%s | %s ||%s %s | город в переводе=%s' % (e.get('id', '')[:8], e.get('start_date'), city, t[:55], fld, other[:55], c))
    print('\n=== C) title_ru == title буквально: %d ===' % len(C))
    for e in C[:10]:
        print('%s | %s' % (e.get('id', '')[:8], (e.get('title') or '')[:70]))

if __name__ == '__main__':
    main()
