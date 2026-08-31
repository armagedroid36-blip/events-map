import json

d = json.load(open(r'C:\Users\armag\projects\events-map\map-style-brand.json', encoding='utf-8'))
# Слои фона и воды
for l in d['layers']:
    ltype = l.get('type', '')
    if ltype == 'background':
        print('BACKGROUND', l.get('id'), l.get('paint'))
    if 'water' in l.get('id', '') or 'sea' in l.get('id', ''):
        print('WATER', l.get('id'), l.get('type'), json.dumps(l.get('paint', {}))[:160])
    if 'road' in l.get('id', '') and l.get('type') == 'line':
        print('ROAD?', l.get('id'), json.dumps(l.get('paint', {}))[:160])
# первые 10 слоёв для порядка
print('--- first layers ---')
for l in d['layers'][:12]:
    print(l.get('id'), l.get('type'))
