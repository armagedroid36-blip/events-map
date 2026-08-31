import json

a = json.load(open(r'C:\Users\armag\projects\events-map\map-style-brand.json', encoding='utf-8'))
b = json.load(open(r'C:\Users\armag\AppData\Local\Temp\liberty.json', encoding='utf-8'))
print('OUR sources:', json.dumps(a['sources'], ensure_ascii=False)[:250])
print('LIB sources:', json.dumps(b['sources'], ensure_ascii=False)[:250])
print('OUR sprite:', a.get('sprite'))
print('LIB sprite:', b.get('sprite'))
print('OUR glyphs:', a.get('glyphs'))
print('LIB glyphs:', b.get('glyphs'))
print('OUR layers:', len(a['layers']), 'LIB layers:', len(b['layers']))
for i in range(min(len(a['layers']), len(b['layers']))):
    if a['layers'][i].get('id') != b['layers'][i].get('id'):
        print('ORDER DIFF at', i, a['layers'][i].get('id'), 'vs', b['layers'][i].get('id'))
for l in b['layers']:
    if l.get('id') == 'water':
        print('LIB water paint:', json.dumps(l.get('paint'))[:150])
