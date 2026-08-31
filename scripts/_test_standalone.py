#!/usr/bin/env python3
"""Открыть standalone maplibre-test.html в новой вкладке, проверить title и скриншот."""
import json
import urllib.request
import asyncio
import base64
import websockets

PORT = 9224
TMP = r'C:\Users\armag\AppData\Local\Temp'


async def main():
    ver = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=10))
    browser_ws = ver['webSocketDebuggerUrl']
    async with websockets.connect(browser_ws, max_size=2 ** 26) as ws:
        seq = 0

        async def cdp(method, **params):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": method, "params": params}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
                if msg.get('id') == seq:
                    return msg

        t = await cdp('Target.createTarget', url='file:///C:/Users/armag/AppData/Local/Temp/maplibre-test.html')
        tid = t['result']['targetId']
        print('TARGET', tid)
        await asyncio.sleep(18)
        tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=10))
        page = [x for x in tabs if x.get('id') == tid]
        if page:
            print('TITLE', page[0].get('title', ''))
            ws2 = page[0]['webSocketDebuggerUrl']
            async with websockets.connect(ws2, max_size=2 ** 26) as ws2:
                s = await cdp2(ws2, 'Page.captureScreenshot', format='png')
                with open(TMP + '\\standalone_map.png', 'wb') as f:
                    f.write(base64.b64decode(s['result']['data']))
                print('SHOT_OK')


async def cdp2(ws, method, **params):
    await ws.send(json.dumps({"id": 1, "method": method, "params": params}))
    while True:
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
        if msg.get('id') == 1:
            return msg


asyncio.run(main())
