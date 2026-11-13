import json, os, re, unicodedata, itertools
from collections import defaultdict

SNAP = os.environ['LOCALAPPDATA'] + '/Temp/prod-860.json'
d = json.load(open(SNAP, encoding='utf-8'))
cards = d['cards']
print('карточек', len(cards))
print('поля:', sorted(cards[0].keys()))

STOP = set("""the and for with from night live show party festival концерт вечер
festa festival event events 2026 2027 day days week new year christmas""".split())

def words(*titles):
    s = set()
    for t in titles:
        if not t:
            continue
        t = unicodedata.normalize('NFKC', str(t)).lower()
        for w in re.findall(r'[0-9a-zа-яё\u0370-\u03ff]{5,}', t):
            if w not in STOP:
                s.add(w)
    return s

def wset(c):
    return words(c.get('title'), c.get('title_ru'), c.get('title_en'))

def dur(c):
    if not c.get('end_date') or not c.get('start_date'):
        return 0
    from datetime import date
    try:
        a = date.fromisoformat(str(c['start_date'])[:10]); b = date.fromisoformat(str(c['end_date'])[:10])
        return (b - a).days
    except Exception:
        return 0

def tmin(t):
    if not t:
        return None
    m = re.match(r'^(\d{1,2}):(\d{2})', str(t))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None

# кандидаты: карточка с интервалом >0 дней, у которой end_time задан
cands = [c for c in cards if dur(c) > 0 and c.get('end_time')]
print('карточек с интервалом и end_time:', len(cands))

leads = []
for c in cands:
    et = tmin(c.get('end_time'))
    if et is None:
        continue
    ws = wset(c)
    if len(ws) < 2:
        continue
    for o in cards:
        if o.get('id') == c.get('id'):
            continue
        if str(o.get('start_date'))[:10] < str(c.get('start_date'))[:10]:
            continue
        if tmin(o.get('start_time')) != et:
            continue
        ow = wset(o)
        common = ws & ow
        if len(common) < 2:
            continue
        same_city = (o.get('city') or '') == (c.get('city') or '')
        # сигнал: end_time интервальной карточки = start_time соседа того же события
        leads.append({
            'id': c['id'], 'title': c.get('title'), 'city': c.get('city'),
            'start': f"{c.get('start_date')} {c.get('start_time')}", 'end': f"{c.get('end_date')} {c.get('end_time')}",
            'end_time': c.get('end_time'),
            'other_id': o['id'], 'other_title': o.get('title'), 'other_city': o.get('city'),
            'other_start': f"{o.get('start_date')} {o.get('start_time')}", 'same_city': same_city,
            'common': sorted(common)[:6],
        })
print('лидов:', len(leads))
seen = set()
for l in leads:
    k = (l['id'], l['other_id'])
    if k in seen: continue
    seen.add(k)
    print(json.dumps(l, ensure_ascii=False))
json.dump(leads, open(os.environ['LOCALAPPDATA'] + '/Temp/leads-860.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
