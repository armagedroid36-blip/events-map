"""Замер веса публичного пакета событий, который SPA тянет на каждой странице.

Сравнивает два RPC: полный list_active_events и облегчённый
list_active_event_cards (задача SEO P1, kanban t_2a143ab5).
Критерий: облегчённый набор <= 700 КБ raw / <= 200 КБ gzip при >= 1000 строках.

Запуск: python scripts/measure-active-payload.py
Ключи берутся из .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — в вывод не
печатаются. Пагинация — limit/offset: PostgREST отдаёт не больше 1000 строк на
запрос. Байты считаются по реальному телу HTTP-ответа (тот же JSON, что уходит в
SPA), gzip — zlib уровень 9 по склеенному телу (как Accept-Encoding: gzip).
"""
import gzip
import json
import os
import re
import urllib.request

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 1000


def env():
    out = {}
    with open(os.path.join(PROJ, '.env'), encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
            if m:
                out[m.group(1)] = m.group(2)
    return out


E = env()
REST = E['VITE_SUPABASE_URL'].rstrip('/') + '/rest/v1'
KEY = E['VITE_SUPABASE_ANON_KEY']
HEADERS = {
    'apikey': KEY,
    'Authorization': 'Bearer ' + KEY,
    'Content-Type': 'application/json',
}


def rpc(name):
    """Постраничное чтение RPC-набора; возвращает (строк, raw, gzip)."""
    raw = rows = off = 0
    chunks = []
    while True:
        req = urllib.request.Request(
            f'{REST}/rpc/{name}?limit={PAGE}&offset={off}', headers=HEADERS, data=b'{}')
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read()
        page = json.loads(body.decode('utf-8'))
        chunks.append(body)
        raw += len(body)
        rows += len(page)
        if len(page) < PAGE:
            break
        off += PAGE
    return rows, raw, len(gzip.compress(b''.join(chunks), 9))


if __name__ == '__main__':
    for name in ('list_active_events', 'list_active_event_cards'):
        try:
            rows, raw, gz = rpc(name)
        except Exception as exc:  # noqa: BLE001 — печатаем причину как есть
            print(f'{name:<24} ОШИБКА: {exc}')
            continue
        print(f'{name:<24} строк={rows:>5}  raw={raw/1024:>8.1f} КБ  '
              f'gzip={gz/1024:>7.1f} КБ  {raw/max(rows,1):>5.0f} байт/строка')
