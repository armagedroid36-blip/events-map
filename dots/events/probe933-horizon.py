import os, json, urllib.request, urllib.parse, collections, datetime

env = {}
for line in open(os.path.expanduser('~/projects/events-map/.env'), encoding='utf-8'):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
U = env.get('SUPABASE_URL') or env.get('VITE_SUPABASE_URL')
K = env.get('SUPABASE_SERVICE_ROLE')

def get(params):
    url = U + '/rest/v1/events?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'apikey': K, 'Authorization': 'Bearer ' + K,
        'Accept-Encoding': 'identity', 'Prefer': 'count=none'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

rows, off = [], 0
while True:
    p = [('select', 'id,city,start_date,end_date,recurrence,lat,lng'),
         ('status', 'eq.active'), ('order', 'start_date.asc,id.asc'),
         ('limit', '60'), ('offset', str(off))]
    page = get(p)
    rows += page
    if len(page) < 60:
        break
    off += 60

today = datetime.date(2026, 11, 16)
by = collections.defaultdict(lambda: {'vis': 0, 'all': 0, 'last': None})
for r in rows:
    c = (r.get('city') or '?').split(',')[0].strip()
    by[c]['all'] += 1
    sd = r.get('start_date'); ed = r.get('end_date')
    d = datetime.date.fromisoformat(sd) if sd else None
    e = datetime.date.fromisoformat(ed) if ed else d
    vis = bool(r.get('recurrence')) or (e is not None and e >= today) or (d is not None and d >= today)
    if vis:
        by[c]['vis'] += 1
        if e and (by[c]['last'] is None or e > by[c]['last']):
            by[c]['last'] = e

print('живых', len(rows), 'городов', len(by))
for c, v in sorted(by.items(), key=lambda x: -x[1]['vis']):
    print('%-22s видно %3d / всего %3d  до %s' % (c, v['vis'], v['all'], v['last']))
