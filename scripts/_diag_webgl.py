#!/usr/bin/env python3
"""Диагностика: WebGL в headless, сетевые запросы к тайлам."""
import json
import urllib.request
import asyncio
import websockets

PORT = 9223
URL_FILTER = 'github.io'


def get_tabs():
    return json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=10))


async def main():
    tabs = get_tabs()
    page = [t for t in tabs if URL_FILTER in t.get('url', '')]
    if not page:
        print('NO_PAGE')
        return
    ws_url = page[0]['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=2 ** 26) as ws:
        seq = 0

        async def ev(expr, timeout=30):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": "Runtime.evaluate",
                                      "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == seq:
                    r = msg.get('result', {})
                    if 'exceptionDetails' in r:
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:300]
                    return r.get('result', {}).get('value')

        print('WEBGL2', await ev("(() => { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); })()"))
        print('WEBGL', await ev("(() => { const c = document.createElement('canvas'); return !!c.getContext('webgl'); })()"))
        # Сетевые запросы к тайлам: перехватим через Performance API (буфер записей)
        perf = await ev("JSON.stringify(performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('openfreemap') || n.includes('tiles.')).slice(0, 10))")
        print('RESOURCES', perf)
        # Прямой fetch тайла из браузера
        fet = await ev("(async () => { try { const r = await fetch('https://tiles.openfreemap.org/planet/tilejson.json', {method: 'GET'}); return r.status + ' ' + (await r.text()).slice(0, 120); } catch (e) { return 'FETCH_ERR ' + e.message; } })()")
        print('TILE_FETCH', fet)


asyncio.run(main())
