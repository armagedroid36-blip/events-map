import json,os,urllib.request
URL=None;KEY=None
for line in open('.env',encoding='utf-8',errors='ignore'):
    line=line.strip()
    if line.startswith('VITE_SUPABASE_URL=') and not URL: URL=line.split('=',1)[1]
    if line.startswith('SUPABASE_URL=') and not URL: URL=line.split('=',1)[1]
    if line.startswith('SUPABASE_SERVICE_ROLE='): KEY=line.split('=',1)[1]
rows=json.load(open('all958.json',encoding='utf-8'))
def full(p): return [r['id'] for r in rows if r['id'].startswith(p)][0]
pairs=[('2e28f84e','bd0d6764'),('8363c9b8','1dd781d1')]
for keep,arch in pairs:
    body=json.dumps({'status':'archived','auto_review':{'verdict':'reject','reason':f'дубль: то же событие, что живая карточка {keep} (совпали площадка, дата и время)','at':'2026-11-17T13:25:00Z','by':'dot-events'}}).encode()
    req=urllib.request.Request(f"{URL}/rest/v1/events?id=eq.{full(arch)}&status=eq.active",data=body,method='PATCH',
        headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=representation'})
    with urllib.request.urlopen(req,timeout=40) as r:
        d=json.load(r)
    print('arch', arch, '->', d[0]['status'], d[0]['id'][:8]) if d else print('arch',arch,'EMPTY')
