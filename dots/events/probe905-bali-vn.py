"""Зонд 905: два класса по Бали/Вьетнаму, которые НЕ надо разбирать повторно.

1) «Метка района Бали не совпадает с адресом» — сырой матчинг токенов даёт десятки
   ложных: "kuta" ловится в административных «Kec. Kuta Utara» (Чангу) и «Kuta Sel.»
   (Джимбаран). С фильтром админ-квалификаторов подтверждённых расхождений 0.
2) «Дубли Бали/Вьетнам» по (одна дата + один город + 2 общих значимых слова + <=2 км):
   кандидаты есть, но подтверждённых дублей 0 — общие слова это тип события
   («танцевальные представления» у РАЗНЫХ храмов Убуда в 19:30) и день недели.

Запуск: python probe905-bali-vn.py [--ctl]
CTL портит одну карточку — зонд обязан показать ровно её.
"""
import json, os, math, re, itertools, collections, sys

SNAP = os.environ.get('SNAP') or os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Temp', 'prod-snap.json')
cards = json.load(open(SNAP, encoding='utf-8'))['cards']
CTL = '--ctl' in sys.argv

grp = [c for c in cards if (c.get('city') or '').endswith('Bali') or c.get('city') in ('Нячанг', 'Дананг')]
if CTL:
    src = next(c for c in grp if c.get('start_date') and c.get('lat'))
    dup = dict(src)
    dup['id'] = 'ctl00000-' + src['id'][8:]
    grp.append(dup)  # контроль: копия обязана дать РОВНО 1 пару и 1 дубль-кандидата
print('карточек Бали+Вьетнам:', len(grp))

BALI = ['Печату', 'Чангу', 'Убуд', 'Табанан', 'Кута', 'Беноа', 'Семиньяк', 'Керобокан',
        'Джимбаран', 'Денпасар', 'Унгасан', 'Сукавати', 'Легиан', 'Чандидаса', 'Санур',
        'Кутух', 'Тегалаланг', 'Чемаги', 'Далунг', 'Переренан']
LAT = {'Печату': r'pecatu|uluwatu', 'Чангу': r'canggu', 'Убуд': r'ubud', 'Табанан': r'tabanan',
       'Кута': r'\bkuta\b(?! (utara|sel|timur|barat))', 'Беноа': r'benoa|nusa dua',
       'Семиньяк': r'seminyak', 'Керобокан': r'kerobokan', 'Джимбаран': r'jimbaran',
       'Денпасар': r'denpasar', 'Унгасан': r'ungasan', 'Сукавати': r'sukawati',
       'Легиан': r'legian', 'Чандидаса': r'candidasa', 'Санур': r'sanur', 'Кутух': r'\bkutuh\b'}

mism = []
for c in grp:
    lab = (c.get('city') or '').replace(', Bali', '').strip()
    addr = (c.get('address') or '').lower()
    if lab not in BALI or not addr:
        continue
    found = {d for d in BALI if d.lower() in addr or re.search(LAT.get(d, '$^'), addr)}
    if found - {lab}:
        mism.append((c['id'][:8], lab, sorted(found - {lab})))
print('1) метка района vs адрес — подтверждённых расхождений:', len(mism))
for m in mism:
    print('  ', m)

STOP = set('''и в на у с по за от до для не а но или как что где когда вечеринка концерт
встреча завтрак ужин квиз вечер ночь день программа шоу спектакль экскурсия тур мастер
класс занятие урок церемония ретрит фестиваль маркет ярмарка bали нячанг дананг воскресенье
понедельник вторник среда четверг пятница суббота sunday monday tuesday wednesday thursday
friday saturday november december january'''.split())


def toks(c):
    t = ' '.join(x for x in [c.get('title'), c.get('title_ru'), c.get('title_en')] if x).lower().replace('ё', 'е')
    return {w for w in re.findall(r'[a-zа-я0-9]{4,}', t) if w not in STOP}


def hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))


byday = collections.defaultdict(list)
for c in grp:
    if c.get('start_date') and c.get('lat'):
        byday[(c['start_date'], c.get('city'))].append(c)

pairs = []
for lst in byday.values():
    for a, b in itertools.combinations(lst, 2):
        common = toks(a) & toks(b)
        if len(common) < 2:
            continue
        d = hav((a['lat'], a['lng']), (b['lat'], b['lng']))
        if d > 2.0:
            continue
        # время разное у обеих => это разные сеансы/события, не дубль (правило 21.10)
        dup = not (a.get('start_time') and b.get('start_time') and a['start_time'] != b['start_time'])
        pairs.append((dup, round(d, 2), sorted(common), a['id'][:8], (a.get('title') or '')[:50],
                      b['id'][:8], (b.get('title') or '')[:50]))

dups = [p for p in pairs if p[0]]
print('2) дубли (дата+город+2 слова+<=2 км): кандидатов', len(pairs), ', из них с совпадающим/пустым временем:', len(dups))
for p in dups:
    print('   ДУБЛЬ-КАНДИДАТ', p[1], 'км', p[2][:4], p[3], repr(p[4]), '|', p[5], repr(p[6]))
print('ИТОГ: расхождений метки', len(mism), ', дублей-кандидатов', len(dups))
