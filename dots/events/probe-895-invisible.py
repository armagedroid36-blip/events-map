#!/usr/bin/env python3
# Зонд 895: карточки, которые НЕ ВИДНЫ на карте (нет координат / нули / мусор).
# Офлайн по прод-снапшоту: %TEMP%\prod-891.json (структура {cards:[...]}).
# Печатает: всего карточек, без lat/lng, ровно (0,0), вне мировой рамки,
# и по каждому городу — сколько таких. Плюс координаты дальше 60 км от медианы своего города.
import json, os, sys, statistics

p = os.path.join(os.environ.get('TEMP', ''), 'prod-891.json')
d = json.load(open(p, encoding='utf-8'))
cards = d.get('cards') or d.get('events') or []
print('снапшот:', os.path.basename(p), 'generated_at', d.get('generated_at'), 'карточек', len(cards))

def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f

missing, zero, oob, ok = [], [], [], 0
for c in cards:
    la, ln = num(c.get('lat')), num(c.get('lng'))
    if la is None or ln is None:
        missing.append(c)
        continue
    if la == 0 and ln == 0:
        zero.append(c)
        continue
    if not (-90 <= la <= 90 and -180 <= ln <= 180):
        oob.append(c)
        continue
    c['_la'], c['_ln'] = la, ln
    ok += 1

print('с координатами:', ok, '| без lat/lng:', len(missing), '| (0,0):', len(zero), '| вне рамки:', len(oob))

def by_city(rows):
    m = {}
    for c in rows:
        k = c.get('city') or '(пусто)'
        m[k] = m.get(k, 0) + 1
    return sorted(m.items(), key=lambda x: -x[1])

for name, rows in (('БЕЗ КООРДИНАТ', missing), ('(0,0)', zero), ('ВНЕ РАМКИ', oob)):
    if not rows:
        print(f'{name}: 0')
        continue
    print(f'--- {name}: {len(rows)}')
    for city, n in by_city(rows):
        print(f'   {city}: {n}')

print('--- примеры без координат:')
for c in missing[:15]:
    print('  ', c.get('id', '')[:8], (c.get('city') or '-'), '|', (c.get('title') or '')[:60], '| lat', c.get('lat'), 'lng', c.get('lng'))

# грубая проверка «пин не в своей стране»: медиана по городу, >60 км
groups = {}
for c in cards:
    if '_la' in c:
        groups.setdefault(c.get('city') or '', []).append(c)
print('--- пин дальше 60 км от медианы своего города (города с >=5 карточек):')
far = 0
for city, rows in groups.items():
    if len(rows) < 5:
        continue
    mla = statistics.median([r['_la'] for r in rows])
    mln = statistics.median([r['_ln'] for r in rows])
    for r in rows:
        dy = (r['_la'] - mla) * 111.0
        dx = (r['_ln'] - mln) * 111.0 * 0.85
        dist = (dx * dx + dy * dy) ** 0.5
        if dist > 60:
            far += 1
            print(f'   {r.get("id","")[:8]} {city}: {dist:.0f} км | {r.get("start_date")} | {(r.get("title") or "")[:55]}')
print('   всего:', far)
