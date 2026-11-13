import json, os, re, unicodedata
from datetime import datetime, timedelta

T = os.environ['LOCALAPPDATA'] + '\\Temp'

def norm(s):
    s = unicodedata.normalize('NFKD', (s or '').lower())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^a-zа-я0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

feed = {}
recs = 0
for city in ['limassol', 'nicosia', 'larnaca', 'paphos', 'famagusta']:
    d = json.load(open(f'{T}\\cn-{city}-866.json', encoding='utf-8'))
    evs = d.get('events') or []
    recs += len(evs)
    for e in evs:
        t = norm(e.get('title'))
        if not t:
            continue
        feed.setdefault(t, []).append({
            'slug': e.get('slug'), 'start_at': e.get('start_at'), 'end_at': e.get('end_at'),
            'city': e.get('city') or (e.get('venue') or {}).get('city'),
            'venue': (e.get('venue') or {}).get('name'),
        })
print('лента записей:', recs, 'уник. названий:', len(feed))

cards = json.load(open(f'{T}\\prod-866.json', encoding='utf-8'))['cards']
win = [c for c in cards if '2026-11-13' <= (c.get('start_date') or '') <= '2026-11-21']
matched = moved = same = 0
leads = []
for c in win:
    key = norm(c.get('title'))
    if key not in feed:
        continue
    matched += 1
    cand = None
    for r in feed[key]:
        if not r['start_at']:
            continue
        loc = datetime.strptime(r['start_at'][:19], '%Y-%m-%dT%H:%M:%S') + timedelta(hours=2)
        r['local_date'] = loc.strftime('%Y-%m-%d')
        r['local_time'] = loc.strftime('%H:%M')
    dates = {r.get('local_date') for r in feed[key]}
    d0 = c.get('start_date')
    if d0 in dates:
        same += 1
    else:
        moved += 1
        leads.append({'id': (c.get('id') or '')[:8], 'title': c.get('title'), 'card_date': d0,
                      'card_time': c.get('start_time'), 'city': c.get('city'),
                      'feed': [(r.get('local_date'), r.get('local_time'), r.get('slug')) for r in feed[key]]})
print('совпало название:', matched, '| дата совпала:', same, '| дата РАСХОДИТСЯ:', moved)
for l in leads[:25]:
    print(l['id'], l['card_date'], l['card_time'], (l['title'] or '')[:45], '->', l['feed'])
json.dump(leads, open(f'{T}\\leads-866.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
