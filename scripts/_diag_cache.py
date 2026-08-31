#!/usr/bin/env python3
"""Очистка кэша браузера + reload + проверка pbf."""
import json
import urllib.request
import asyncio
import websockets

PORT = 9224
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
        await cdp('Network.clearBrowserCache')
        await cdp('Network.setCacheDisabled', cacheDisabled=True)
        reqs = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
                    if msg.get('method') == 'Network.requestWillBeSent':
                        u = msg['params']['request'].get('url', '')
                        if 'openfreemap' in u:
                            reqs.append(u.split('openfreemap.org/')[1][:75])
            except Exception:
                return
        task = asyncio.create_task(listener())
        await ev("location.reload()")
        await asyncio.sleep(35)
        task.cancel()
        print('REQS', json.dumps(reqs[:25], ensure_ascii=True))
        print('REQ_COUNT', len(reqs))
        print('PBF', sum(1 for r in reqs if '.pbf' in r))


asyncio.run(main())
