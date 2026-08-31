#!/usr/bin/env python3
"""Preview: история запросов openfreemap + скриншот + пиксели."""
import json
import urllib.request
import asyncio
import base64
import websockets
from PIL import Image

PORT = 9225
URL_FILTER = '127.0.0.1:4173'
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

        async def ev(expr, timeout=40):
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
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
                if msg.get('id') == seq:
                    return msg

        hist = await ev("JSON.stringify(performance.getEntriesByType('resource').filter(r => r.name.includes('openfreemap')).map(r => r.name.split('openfreemap.org/')[1].slice(0, 60) + ' st=' + (r.responseStatus||'?') + ' sz=' + r.transferSize).slice(0, 20))")
        print('HIST', hist)
        s = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\preview_map.png', 'wb') as f:
            f.write(base64.b64decode(s['result']['data']))
        print('SHOT_OK')


asyncio.run(main())
