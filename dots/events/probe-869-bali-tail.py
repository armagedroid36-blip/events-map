"""869: сверка карточек Бали/Дананг/Нячанг окна 13.11-31.12 с ПОЛНОЙ лентой Балифорума.

Лимит 868 ("full feed ordered not by date, pages useless") снят: лента упорядочена
хронологически от 2004, поэтому будущее лежит в ХВОСТЕ (pageSize=100, страницы 93-95
из 95). Здесь читаются хвостовые страницы + defaultList=1 и сравниваются с карточками.
"""
import json, os, re, subprocess, unicodedata
from datetime import date

TEMP = os.environ.get('LOCALAPPDATA', '') + r'\Temp'
PROXY = 'http://127.0.0.1:10809'
TAIL_PAGES = [93, 94, 95]


def fetch_tail(page):
    p = os.path.join(TEMP, f'bali-tail-{page}.json')
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return open(p, 'rb').read()
    url = f'https://baliforum.ru/api/v1/events?pageSize=100&page={page}'
    subprocess.run(['curl', '-s', '-x', PROXY, '--max-time', '25', '-o', p, url], capture_output=True)
    return open(p, 'rb').read() if os.path.exists(p) else b''


def norm(s):
    s = (s or '').lower()
    s = unicodedata.normalize('NFKD', s)
    s = re.sub(r'[^a-zа-яё0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


feed = {}
records = 0
for pg in TAIL_PAGES:
    raw = fetch_tail(pg)
    if not raw:
        print('page', pg, 'пусто')
        continue
    d = json.loads(raw.decode('utf-8', 'replace'))
    for e in d.get('data') or []:
        records += 1
        t = norm(e.get('title'))
        ds = sorted(x.get('startAt', '')[:10] for x in (e.get('eventDates') or []) if x.get('startAt'))
        if ds:
            feed.setdefault(t, []).append((e.get('slug'), ds, (e.get('place') or {}).get('title')))

print(f'лента-хвост: страниц {len(TAIL_PAGES)}, записей {records}, названий {len(feed)}')

snap = json.load(open(os.path.join(TEMP, 'prod-869.json'), encoding='utf-8'))
cards = snap.get('cards') or []
BALI = {'Убуд', 'Чангу', 'Печату', 'Кута', 'Семиньяк', 'Санур', 'Денпасар', 'Джимбаран', 'Легиан',
        'Амед', 'Сидемен', 'Ловина', 'Нуса-Дуа', 'Тегалаланг', 'Кутух', 'Кандидаса', 'Чемаги', 'Далунг',
        'Переренан', 'Табанан', 'Керобокан', 'Букит'}
VIET = {'Нячанг', 'Дананг'}
lo, hi = date(2026, 11, 13), date(2026, 12, 31)


def in_scope(c):
    c0 = (c or '').split(',')[0].strip()
    return c0 in BALI or c0 in VIET


window = []
for c in cards:
    if not in_scope(c.get('city')):
        continue
    sd = (c.get('start_date') or '')[:10]
    if not sd:
        continue
    d = date.fromisoformat(sd)
    if lo <= d <= hi:
        window.append(c)

print(f'карточек окна {lo}-{hi}: {len(window)}')

matched, missing, mism = 0, [], []
for c in window:
    t = norm(c.get('title'))
    if t not in feed:
        missing.append((c.get('id', '')[:8], c.get('title'), c.get('start_date')))
        continue
    matched += 1
    card_date = (c.get('start_date') or '')[:10]
    if not any(card_date in ds for _, ds, _ in feed[t]):
        mism.append((c.get('id', '')[:8], c.get('title'), card_date,
                     [ds[:2] for _, ds, _ in feed[t]][:2], c.get('city')))

print(f'совпало по названию {matched}, не найдено в хвосте ленты {len(missing)}, расхождений даты {len(mism)}')
for m in mism:
    print('  ДАТА:', m)
for m in missing:
    print('  НЕТ В ЛЕНТЕ:', m)
