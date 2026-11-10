import json, re, collections, os

p = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'prod-844.json')
data = json.load(open(p, encoding='utf-8'))
cards = data['cards']

# канон города -> токены (RU + латиница/греч.), которыми он может называться в адресе
CITY = {
    'Никосия': ['никосия', 'nicosia', 'λευκωσια', 'lefkosia', 'strovolos', 'strovvolos', 'latsia', 'лация', 'строболос', 'engomi', 'aglanjia'],
    'Лимасол': ['лимасол', 'limassol', 'lemesos', 'λεμεσος', 'polemidia', 'полемидия', 'ypsonas', 'ипсона', 'germasogeia', 'germasoyia'],
    'Ларнака': ['ларнака', 'larnaca', 'larnaka', 'λαρνακα', 'aradippou', 'арадипу', 'kiti', 'кити'],
    'Пафос': ['пафос', 'paphos', 'pafos', 'παφος', 'geroskipou', 'героскипу', 'pegeia', 'пейя', 'coral bay'],
    'Ая-Напа': ['ая напа', 'ayia napa', 'agia napa', 'αγια ναπα'],
    'Протарас': ['протарас', 'protaras', 'πρωταρας'],
    'Паралимни': ['паралимни', 'paralimni', 'παραλιμνι', 'deryneia', 'деринея', 'дериния'],
    'Фамагуста': ['фамагуста', 'famagusta', 'αμμοχωστος', 'ammochostos'],
    'Дананг': ['дананг', 'da nang', 'danang', 'đà nẵng'],
    'Нячанг': ['нячанг', 'nha trang', 'nhatrang'],
    'Чангу': ['чангу', 'canggu'],
    'Убуд': ['убуд', 'ubud'],
    'Семиньяк': ['семиньяк', 'seminyak'],
    'Кута': ['кута', 'kuta'],
    'Санур': ['санур', 'sanur'],
    'Денпасар': ['денпасар', 'denpasar'],
    'Джимбаран': ['джимбаран', 'jimbaran'],
    'Табанан': ['табанан', 'tabanan'],
}

def city_key(city):
    c = (city or '').lower()
    for canon in CITY:
        if canon.lower() in c:
            return canon
    return None

leads = []
for c in cards:
    ck = city_key(c.get('city'))
    if not ck:
        continue
    addr = (c.get('address') or '').lower()
    if len(addr) < 6 or 'cyprus, cyprus' in addr:
        continue
    found = set()
    for canon, toks in CITY.items():
        for t in toks:
            if re.search(r'(?<![а-яёa-z])' + re.escape(t) + r'(?![а-яёa-z])', addr):
                found.add(canon)
                break
    others = found - {ck}
    if others and ck not in found:
        leads.append((c['id'][:8], c.get('city'), sorted(others), c.get('title')[:50], c.get('start_date'), (c.get('address') or '')[:60]))

print('лидов (адрес называет ДРУГОЙ город, свой не упомянут):', len(leads))
for l in leads:
    print(' | '.join(str(x) for x in l))
