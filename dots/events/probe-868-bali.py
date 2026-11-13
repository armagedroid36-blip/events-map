import json, os, re, subprocess, sys, unicodedata
from datetime import date, datetime

TEMP = os.environ.get('LOCALAPPDATA', '') + r'\Temp'
PROXY = 'http://127.0.0.1:10809'

def fetch(page):
    p = os.path.join(TEMP, f'bali-868-p{page}.json')
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return open(p, 'rb').read()
    url = f'https://baliforum.ru/api/v1/events?defaultList=1&page={page}'
    r = subprocess.run(['curl', '-s', '-x', PROXY, '--max-time', '25', '-o', p, url],
                       capture_output=True)
    if os.path.exists(p):
        return open(p, 'rb').read()
    return b''

def norm(s):
    s = (s or '').lower()
    s = unicodedata.normalize('NFKD', s)
    s = re.sub(r'[^a-zа-яё0-9 ]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

feed = {}
pages = 0
for pg in range(1, 11):
    raw = fetch(pg)
    if not raw:
        break
    try:
        d = json.loads(raw.decode('utf-8', 'replace'))
    except Exception as e:
        print('page', pg, 'parse fail', e)
        break
    ev = d.get('data') or []
    if not ev:
        break
    pages += 1
    for e in ev:
        t = norm(e.get('title'))
        ds = [x.get('startAt', '')[:10] for x in (e.get('eventDates') or []) if x.get('startAt')]
        feed.setdefault(t, []).append((e.get('slug'), ds, (e.get('place') or {}).get('title')))

print(f'лента: страниц {pages}, записей {sum(len(v) for v in feed.values())}, названий {len(feed)}')

snap = json.load(open(os.path.join(TEMP, 'prod-868.json'), encoding='utf-8'))
cards = snap.get('cards') or []
BALI = {'Убуд', 'Чангу', 'Печату', 'Кута', 'Семиньяк', 'Санур', 'Денпасар', 'Джимбаран', 'Легиан',
        'Амед', 'Сидемен', 'Ловина', 'Нуса-Дуа', 'Тегалаланг', 'Кутух', 'Кандидаса', 'Чемаги', 'Далунг',
        'Переренан', 'Табанан', 'Керобокан', 'Букіт', 'Букит'}
VIET = {'Нячанг', 'Дананг'}
def city0(c):
    return (c or '').split(',')[0].strip()

def in_scope(c):
    c0 = city0(c)
    return c0 in BALI or c0 in VIET or 'Бали' in (c or '')

lo, hi = date(2026, 11, 13), date(2026, 12, 31)
win = [c for c in cards if (c.get('start_date') or '')[:10] >= lo.isoformat() and (c.get('start_date') or '')[:10] <= hi.isoformat() and in_scope(c.get('city'))]
print(f'карточек Бали/Дананг/Нячанг в окне 13.11-31.12: {len(win)}')

matched = 0
diff = []
for c in win:
    t = norm(c.get('title'))
    # также title_ru / title_en
    keys = [t] + [norm(c.get(k)) for k in ('title_ru', 'title_en') if c.get(k)]
    hit = None
    for k in keys:
        if k in feed:
            hit = feed[k]; break
    if not hit:
        continue
    matched += 1
    sd = (c.get('start_date') or '')[:10]
    all_dates = sorted({d for _, ds, _ in hit for d in ds})
    # карточка может быть серией: сравниваем, попадает ли дата в набор дат ленты
    if sd not in all_dates:
        # ближайшая дата ленты
        near = min(all_dates, key=lambda d: abs((date.fromisoformat(d) - date.fromisoformat(sd)).days)) if all_dates else None
        diff.append((c.get('id', '')[:8], c.get('title'), c.get('city'), sd, c.get('start_time'), near, all_dates[:6]))

print(f'совпало по названию: {matched}; дата расходится: {len(diff)}')
for x in diff:
    print(' ', x[0], '|', (x[1] or '')[:52], '|', x[2], '| карточка', x[3], x[4], '| лента', x[5], x[6])
