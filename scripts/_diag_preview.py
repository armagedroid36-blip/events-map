#!/usr/bin/env python3
"""Перехват консоли на preview (9225): логи маплibre + сеть."""
import json
import urllib.request
import asyncio
import websockets

PORT = 9225
URL_FILTER = '127.0.0.1:4173'


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

        async def cdp(method, **params):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": method, "params": params}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
                if msg.get('id') == seq:
                    return msg

        await cdp('Runtime.enable')
        await cdp('Network.enable')
        logs = []
        reqs = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=80))
                    m = msg.get('method', '')
                    if m == 'Runtime.consoleAPICalled':
                        txt = ' '.join(str(a.get('value', '')) for a in msg['params']['args'])[:200]
                        if any(k in txt for k in ('MAP_', 'SRC_', 'STYLE', 'ERR')):
                            logs.append(msg['params']['type'] + ': ' + txt)
                    elif m == 'Network.requestWillBeSent':
                        u = msg['params']['request'].get('url', '')
                        if 'openfreemap' in u:
                            reqs.append(u.split('openfreemap.org/')[1][:70])
            except Exception:
                return
        task = asyncio.create_task(listener())
        await asyncio.sleep(45)
        task.cancel()
        print('LOGS', json.dumps(logs[:15], ensure_ascii=True))
        print('REQS', json.dumps(reqs[:15], ensure_ascii=True))
        print('PBF', sum(1 for r in reqs if '.pbf' in r))


asyncio.run(main())
