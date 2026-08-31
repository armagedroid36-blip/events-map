#!/usr/bin/env python3
"""Отключаем кэш, reload, слушаем ответы тайлов, скриншот."""
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

        await cdp('Network.enable')
        await cdp('Network.setCacheDisabled', cacheDisabled=True)
        responses = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
                    if msg.get('method') == 'Network.responseReceived':
                        r = msg['params']['response']
                        url = r.get('url', '')
                        if 'openfreemap' in url:
                            responses.append(url.split('openfreemap.org/')[1][:70] + ' st=' + str(r.get('status')) + ' enc=' + str(r.get('encodedDataLength')))
                    if msg.get('method') == 'Network.loadingFailed':
                        p = msg['params']
                        if 'openfreemap' in p.get('requestId', ''):
                            pass
            except Exception:
                return

        task = asyncio.create_task(listener())
        await ev("location.reload()")
        await asyncio.sleep(30)
        task.cancel()
        print('RESPONSES', json.dumps(responses[:30], ensure_ascii=True))
        print('RESP_COUNT', len(responses))
        s = await cdp('Page.captureScreenshot', format='png')
        with open(TMP + '\\map_nocache.png', 'wb') as f:
            f.write(base64.b64decode(s['result']['data']))
        print('SHOT_OK')


asyncio.run(main())
