#!/usr/bin/env python3
"""Скриншот на 9226 (swiftshader) + пиксели."""
import json
import urllib.request
import asyncio
import base64
import websockets

PORT = 9226
URL_FILTER = '127.0.0.1:4173'
TMP = r'C:\Users\armag\AppData\Local\Temp'


def get_tabs():
    return json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=10))


async def main():
    for _ in range(20):
        try:
            tabs = get_tabs()
            page = [t for t in tabs if URL_FILTER in t.get('url', '')]
            if page:
                break
        except Exception:
            pass
        await asyncio.sleep(1)
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

        await asyncio.sleep(20)
        print('MPERR', json.dumps((await ev("document.getElementById('mperr') ? document.getElementById('mperr').textContent : 'no'"))[-120:], ensure_ascii=True))
        s = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\swift_map.png', 'wb') as f:
            f.write(base64.b64decode(s['result']['data']))
        print('SHOT_OK')


asyncio.run(main())
