"""Зонд 910: гигиена витрины по прод-снапшоту (офлайн, без базы).
Проверяет классы, которые видны пользователю: HTML-сущности в названиях,
расщепление метки города на варианты (ломает фильтр по городу),
точные дубли (название+дата+город) и горизонт видимости по городам.

Запуск: python dots/events/probe910-quality.py [путь к prod-snap.json]
Питфол: нормализация названий обязана сохранять ЛЮБЫЕ буквы — греческие
названия Кипра при фильтре [a-zа-яё] схлопываются в пустую строку и зонд
рапортует дубли «по пустому названию» (проверено 15.11.2026).
"""
import json, re, collections, os, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.environ.get('LOCALAPPDATA', '.'), 'Temp', 'prod-snap.json')
TODAY = '2026-11-15'
HORIZON = '2026-11-22'


def norm(s):
    s = (s or '').lower().replace('&amp;', '&')
    return ' '.join(''.join(ch if (ch.isalnum() or ch == ' ') else ' ' for ch in s).split())


def cbase(c):
    return re.split(r',', c or '')[0].strip()


def main():
    d = json.load(open(PATH, encoding='utf-8'))
    ev = d['cards']
    print('карточек', len(ev), 'gen', d.get('generated_at'))

    ent = [e for e in ev if re.search(r'&(amp|lt|gt|quot|apos|nbsp|#\d+);', e.get('title') or '')]
    print('HTML-сущности в названии:', len(ent))

    groups = collections.defaultdict(collections.Counter)
    for e in ev:
        groups[cbase(e.get('city'))][e.get('city') or ''] += 1
    multi = {b: c for b, c in groups.items() if len(c) > 1}
    print('меток города', len(groups), 'с вариантами написания:', len(multi))
    for b, c in list(multi.items())[:10]:
        print('  ', b, dict(c))

    g = collections.defaultdict(list)
    for e in ev:
        g[(norm(e.get('title')), (e.get('start_date') or '')[:10], norm(cbase(e.get('city'))))].append(e)
    dups = {k: v for k, v in g.items() if len(v) > 1 and k[0]}
    print('точных дублей (название+дата+город):', len(dups), 'карточек', sum(len(v) for v in dups.values()))
    for k, v in list(dups.items())[:10]:
        print('  ', k[1], k[2], '|', k[0][:40], '|', [(x['id'][:8], x.get('start_time')) for x in v])

    cnt = collections.Counter(cbase(e.get('city')) for e in ev if (e.get('start_date') or '')[:10] >= HORIZON)
    print('видно после', HORIZON, ':', sum(cnt.values()), 'карточек,', len(cnt), 'городов')
    print('  ', cnt.most_common())


if __name__ == '__main__':
    main()
