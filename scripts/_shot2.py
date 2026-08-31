#!/usr/bin/env python3
"""Скриншот + вьюпорт + канвас на порту 9224 (без --disable-gpu)."""
import json
import urllib.request
import asyncio
import base64
import websockets

PORT = 9224
URL_FILTER = 'github.io'
TMP = r'C:\Users\armag\AppData\Local\Temp'


def get_tabs():
    return json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=10))


async def main():
    tabs = get_tabs()
    page = [t for t in tabs if URL_FILTER in t.get('url', '')]
    if not page:
        print('NO_PAGE', [t['url'][:60] for t in tabs if t.get('type') == 'page'])
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

        async def cdp(method, **params):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": method, "params": params}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if msg.get('id') == seq:
                    return msg

        print('VIEWPORT', await ev('window.innerWidth + "x" + window.innerHeight'))
        await asyncio.sleep(15)
        print('CANVAS', await ev('document.querySelector(".maplibregl-canvas") !== null'))
        print('CANVAS_SIZE', await ev("(() => { const c = document.querySelector('.maplibregl-canvas'); return c ? c.width + 'x' + c.height : 'none'; })()"))
        print('TILES_LOADED', await ev("performance.getEntriesByType('resource').filter(r => r.name.includes('natural_earth')).length"))
        s = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\map_no_gpu_flag.png', 'wb') as f:
            f.write(base64.b64decode(s['result']['data']))
        print('SHOT_OK')


asyncio.run(main())
