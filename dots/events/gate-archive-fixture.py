#!/usr/bin/env python3
"""Фикстура гейта sitemap: архивное событие БЕЗ страницы = дрейф (A), а не потеря (B).

CASE 1: 12 выпавших event-URL, чьих страниц в dist нет, но id есть в
        data/archive.json  -> все (A) архивный дрейф, «0 необъяснимых», код 0.
CASE 2 (контроль): те же 12 id, но их нет ни в archive.json, ни в events.json
        -> все (B), код 1 (доля 10% > 5%).
CASE 3 (контроль доли): 6 архивных без страниц из 120 loc (5%) -> код 0 и
        секция (A) печатает 6.

Запуск: python dots/events/gate-archive-fixture.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GATE = os.path.join(REPO, 'scripts', 'verify-sitemap-shrink.mjs')
BASE = 'https://mypins.site'
FILLERS = 108


def uid(n):
    return f'{n:08x}-0000-4000-8000-000000000000'


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)


def sitemap(urls):
    body = ''.join(f'<url><loc>{u}</loc></url>' for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset>{body}</urlset>'


def build(tmp, lost_ids, in_archive, with_events=True):
    dist = os.path.join(tmp, 'dist')
    shutil.rmtree(dist, ignore_errors=True)
    keep = [f'{BASE}/blog/post-{i}/' for i in range(FILLERS)]
    prev = keep + [f'{BASE}/event/{uid(i)}/slug/' for i in lost_ids]
    write(os.path.join(dist, 'sitemap.xml'), sitemap(keep))
    prev_file = os.path.join(tmp, 'prev-sitemap.xml')
    write(prev_file, sitemap(prev))
    if with_events:
        write(
            os.path.join(dist, 'data', 'events.json'),
            json.dumps({'generated_at': '2026-11-16T00:00:00Z',
                        'cards': [{'id': uid(999), 'start_date': '2027-01-01'}]}),
        )
    if in_archive:
        write(
            os.path.join(dist, 'data', 'archive.json'),
            json.dumps({'generated_at': '2026-11-16T00:00:00Z',
                        'count': len(lost_ids),
                        'events': [{'id': uid(i), 'title': f'old {i}'} for i in lost_ids]}),
        )
    return dist, prev_file


def run(dist, prev):
    env = dict(os.environ, SITEMAP_DIST=dist, PREV_SITEMAP=prev)
    env.pop('ALLOW_SITEMAP_SHRINK', None)
    p = subprocess.run(['node', GATE], cwd=REPO, env=env,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def main():
    cases = []
    tmp = tempfile.mkdtemp(prefix='gate-archive-')

    dist, prev = build(tmp, list(range(12)), in_archive=True)
    code, out = run(dist, prev)
    ok = code == 0 and '0 необъяснимых' in out and 'архив 12' in out
    cases.append(('CASE1 архив без страниц -> A', ok, f'code={code} {out.strip().splitlines()[0]}'))

    dist, prev = build(tmp, list(range(12)), in_archive=False)
    code, out = run(dist, prev)
    ok = code == 1 and '12 необъяснимых' in out
    cases.append(('CASE2 контроль: нет в архиве -> B', ok, f'code={code} {out.strip().splitlines()[0]}'))

    dist, prev = build(tmp, list(range(6)), in_archive=True)
    code, out = run(dist, prev)
    ok = code == 0 and '0 необъяснимых' in out and 'архив 6' in out
    cases.append(('CASE3 5%: архив без страниц -> A', ok, f'code={code} {out.strip().splitlines()[0]}'))

    for name, ok, detail in cases:
        print(('OK   ' if ok else 'FAIL ') + name + ' | ' + detail)
    bad = [c for c in cases if not c[1]]
    print(f'ИТОГ {"OK" if not bad else "ПРОВАЛ"} {len(cases) - len(bad)}/{len(cases)}')
    shutil.rmtree(tmp, ignore_errors=True)
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main())
