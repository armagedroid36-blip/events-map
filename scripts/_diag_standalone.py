#!/usr/bin/env python3
"""Проверка standalone вкладки: maplibregl доступен? fetch unpkg?"""
import json
import urllib.request
import asyncio
import websockets

PORT = 9224


async def main():
    tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=10))
    page = [x for x in tabs if 'maplibre-test' in x.get('url', '')]
    if not page:
        print('NO_TEST_TAB')
        return
    ws_url = page[0]['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=2 ** 26) as ws:
        seq = 0

        async def ev(expr, timeout=30):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": "Runtime.evaluate",
                                      "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == seq:
                    r = msg.get('result', {})
                    if 'exceptionDetails' in r:
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:300]
                    return r.get('result', {}).get('value')

        print('MAPLIBREGLOBJ', await ev('typeof maplibregl'))
        print('CANVAS', await ev('document.querySelector("canvas") !== null'))
        print('WEBGL', await ev("(() => { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); })()"))
        fet = await ev("(async () => { try { const r = await fetch('https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.js', {cache:'no-store'}); return 'st=' + r.status + ' len=' + (await r.text()).length; } catch(e) { return 'ERR ' + e.message; } })()")
        print('UNPKG', fet)
        fet2 = await ev("(async () => { try { const r = await fetch('https://tiles.openfreemap.org/styles/liberty', {cache:'no-store'}); return 'st=' + r.status + ' len=' + (await r.text()).length; } catch(e) { return 'ERR ' + e.message; } })()")
        print('STYLE', fet2)


asyncio.run(main())
