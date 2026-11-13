import json, re, unicodedata, subprocess, os, sys

SNAP = os.path.expandvars(r'%LOCALAPPDATA%\Temp\prod-870.json')
PROXY = 'http://127.0.0.1:10809'

def cn(city, offset, limit=200):
    url = f'https://cyprusnow.app/api/events?city={city}&limit={limit}&offset={offset}'
    p = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'cn-%s-%s.json' % (city, offset))
    r = subprocess.run(['curl', '-s', '-x', PROXY, '--max-time', '60', '-o', p, url],
                       capture_output=True)
    try:
        d = json.load(open(p, encoding='utf-8'))
        return d.get('events', []) or []
    except Exception as e:
        print(f'  [fetch {city}/{offset}] FAIL {e}')
        return []

STOP = {'amp','and','the','in','at','of','with','в','на','и','для','по','от','до','the','a'}
def norm(s):
    s = (s or '').replace('&amp;','&').replace('&#039;',"'").replace('&quot;','"')
    s = re.sub(r'[^\w\s]', ' ', s.lower())
    toks = [t for t in s.split() if len(t) >= 3 and t not in STOP]
    return ' '.join(sorted(set(toks))), set(t for t in toks if len(t) >= 5)

# feed
feed = []
seen = set()
for city in ['nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta']:
    for off in ([0, 200, 400] if city in ('nicosia','limassol') else [0]):
        evs = cn(city, off)
        for e in evs:
            k = e.get('slug')
            if k and k in seen: continue
            if k: seen.add(k)
            feed.append(e)
print('лента: записей', len(feed))

def local_dt(e):
    s = e.get('start_at') or ''
    m = re.match(r'(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})', s)
    if not m: return None, None
    from datetime import datetime, timedelta
    dt = datetime.strptime(s[:16], '%Y-%m-%dT%H:%M') + timedelta(hours=2)
    return dt.strftime('%Y-%m-%d'), dt.strftime('%H:%M')

idx = {}
for e in feed:
    d, t = local_dt(e)
    if not d: continue
    nk, words = norm(e.get('title'))
    idx.setdefault(nk, []).append((d, t, e.get('title'), e.get('venue_name'), e.get('slug')))

snap = json.load(open(SNAP, encoding='utf-8'))['cards']
win = [c for c in snap if c.get('start_date') and '2027-01-01' <= c['start_date'] <= '2027-02-28'
       and 'Кипр' in (c.get('city') or '')]
print('карточек окна янв–фев 2027:', len(win))
matched = diff = new = 0
leads = []
for c in win:
    nk, words = norm(c.get('title'))
    cands = idx.get(nk) or []
    if not cands:
        # soft: 3+ общих значимых слова
        cands = []
        for k, v in idx.items():
            common = words & set(k.split())
            if len(common) >= 3:
                cands += v
        if not cands:
            new += 1
            continue
    matched += 1
    if c['start_date'] not in [x[0] for x in cands]:
        diff += 1
        leads.append((c.get('id'), c.get('title'), c['start_date'], c.get('start_time'),
                      c.get('end_date'), sorted(set((x[0], x[1], x[2]) for x in cands))[:3]))
print(f'совпало по названию {matched}, дата расходится {diff}, нет в ленте {new}')
for l in leads:
    print('РАСХОЖДЕНИЕ', l[0], '|', l[1][:60], '| карточка', l[2], l[3], 'end', l[4])
    for x in l[5]:
        print('    лента:', x[0], x[1], '|', (x[2] or '')[:60])
