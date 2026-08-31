#!/usr/bin/env python3
"""E2E MapLibre: главная карта (рендер, кластеры, атрибуция, зум, маркеры)."""
import json
import urllib.request
import asyncio
import base64
import websockets

PORT = 9223
URL_FILTER = 'github.io'
TMP = r'C:\Users\armag\AppData\Local\Temp'


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

        async def ev(expr, timeout=60):
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
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
                if msg.get('id') == seq:
                    return msg

        async def shot(name):
            s = await cdp('Page.captureScreenshot', format='png')
            with open(TMP + '\\' + name, 'wb') as f:
                f.write(base64.b64decode(s['result']['data']))
            print('SHOT', name)

        # Ждём загрузку и рендер карты
        await asyncio.sleep(12)
        canvas = await ev("document.querySelector('.maplibregl-canvas') !== null")
        print('MAPLIBRE_CANVAS', canvas)
        attr = await ev("[...document.querySelectorAll('.maplibregl-ctrl-attrib')].map(e => e.innerText).join(' | ')")
        print('ATTRIB', json.dumps(attr or '', ensure_ascii=True))
        clusters = await ev("[...document.querySelectorAll('.maplibregl-canvas')].length")
        print('CANVASES', clusters)
        await shot('map_main.png')

        # Зум (двойной клик по центру карты) -> должны появиться кластеры/маркеры
        cdp_rect = await ev("(() => { const c = document.querySelector('.maplibregl-canvas'); const r = c.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()")
        print('CENTER', cdp_rect)
        if cdp_rect:
            x, y = int(cdp_rect['x']), int(cdp_rect['y'])
            # 3 двойных клика = +6 зумов (примерно до 10-11) — кластеры
            for _ in range(3):
                await cdp('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y, button='left', clickCount=2)
                await cdp('Input.dispatchMouseEvent', type='mouseReleased', x=x, y=y, button='left', clickCount=2)
                await asyncio.sleep(2)
            await asyncio.sleep(3)
            await shot('map_zoom.png')
        # Кластеры (canvas-слои не видны в DOM; проверим через queryRenderedFeatures не выйдет —
        # просто скриншот). Атрибуция осталась?
        attr2 = await ev("[...document.querySelectorAll('.maplibregl-ctrl-attrib')].map(e => e.innerText).join(' | ')")
        print('ATTRIB_AFTER_ZOOM', json.dumps(attr2 or '', ensure_ascii=True))


asyncio.run(main())
