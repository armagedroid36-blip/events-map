#!/usr/bin/env python3
"""Свежий скриншот карты после полной загрузки."""
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

        async def ev(expr, timeout=30):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": "Runtime.evaluate",
                                      "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == seq:
                    return msg.get('result', {}).get('result', {}).get('value')

        async def cdp(method, **params):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": method, "params": params}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if msg.get('id') == seq:
                    return msg

        # Дождаться загрузки всех тайлов (сетевой idle)
        await asyncio.sleep(6)
        # Прокрутим? нет — просто скриншот текущего состояния (после зумеров)
        s = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\map_now.png', 'wb') as f:
            f.write(base64.b64decode(s['result']['data']))
        print('SHOT_OK')
        # Вернёмся к начальному виду: перезагрузим и подождём дольше
        await ev("location.reload()")
        await asyncio.sleep(20)
        s2 = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\map_fresh.png', 'wb') as f:
            f.write(base64.b64decode(s2['result']['data']))
        print('SHOT_FRESH_OK')
        # Кластеры: клики-зумы снова
        c = await ev("(() => { const r = document.querySelector('.maplibregl-canvas').getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()")
        for _ in range(4):
            await cdp('Input.dispatchMouseEvent', type='mousePressed', x=int(c['x']), y=int(c['y']), button='left', clickCount=2)
            await cdp('Input.dispatchMouseEvent', type='mouseReleased', x=int(c['x']), y=int(c['y']), button='left', clickCount=2)
            await asyncio.sleep(2)
        await asyncio.sleep(6)
        s3 = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\map_clusters.png', 'wb') as f:
            f.write(base64.b64decode(s3['result']['data']))
        print('SHOT_CLUSTERS_OK')


asyncio.run(main())
