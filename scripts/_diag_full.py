#!/usr/bin/env python3
"""Полный перехват: консоль + сеть с момента reload, состояние канваса."""
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

        await cdp('Runtime.enable')
        await cdp('Network.enable')
        await cdp('Log.enable')
        events = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=70))
                    m = msg.get('method', '')
                    if m == 'Network.requestWillBeSent':
                        u = msg['params']['request'].get('url', '')
                        if 'openfreemap' in u or 'maplibre' in u:
                            events.append('REQ ' + u.split('/')[-2:] and u[8:100])
                    elif m == 'Network.responseReceived':
                        u = msg['params']['response'].get('url', '')
                        if 'openfreemap' in u:
                            events.append('RESP ' + u[8:90] + ' st=' + str(msg['params']['response'].get('status')))
                    elif m == 'Runtime.consoleAPICalled':
                        txt = ' '.join(str(a.get('value', '')) for a in msg['params']['args'])[:150]
                        if 'error' in msg['params']['type'].lower() or 'warn' in msg['params']['type'].lower():
                            events.append(msg['params']['type'].upper() + ': ' + txt)
                    elif m == 'Runtime.exceptionThrown':
                        events.append('EXC: ' + json.dumps(msg['params']['exceptionDetails'].get('text', ''))[:200])
                    elif m == 'Log.entryAdded':
                        e = msg['params']['entry']
                        if e.get('level') in ('error', 'warning'):
                            events.append('LOG ' + e.get('level') + ': ' + (e.get('text', '') or '')[:150])
            except Exception:
                return

        task = asyncio.create_task(listener())
        await ev("location.reload()")
        await asyncio.sleep(35)
        task.cancel()
        print('EVENTS', json.dumps(events[:25], ensure_ascii=True))
        print('CANVAS', await ev('document.querySelector(".maplibregl-canvas") !== null'))


asyncio.run(main())
