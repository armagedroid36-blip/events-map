#!/usr/bin/env python3
"""Preview: все сетевые события openfreemap (запросы и ответы)."""
import json
import urllib.request
import asyncio
import websockets

PORT = 9225
URL_FILTER = '127.0.0.1:4173'


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
        evts = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=70))
                    m = msg.get('method', '')
                    p = msg.get('params', {})
                    if m == 'Network.requestWillBeSent':
                        u = p.get('request', {}).get('url', '')
                        if 'openfreemap' in u:
                            evts.append('REQ ' + u.split('openfreemap.org/')[1][:70])
                    elif m == 'Network.responseReceived':
                        u = p.get('response', {}).get('url', '')
                        if 'openfreemap' in u:
                            evts.append('RESP ' + u.split('openfreemap.org/')[1][:55] + ' st=' + str(p['response'].get('status')))
                    elif m == 'Network.loadingFailed':
                        evts.append('FAIL ' + str(p.get('errorText', '')) + ' ' + str(p.get('blockedReason', '')))
            except Exception:
                return
        task = asyncio.create_task(listener())
        await ev("location.reload()")
        await asyncio.sleep(25)
        task.cancel()
        print('EVTS', json.dumps(evts[:30], ensure_ascii=True))
        print('EVT_COUNT', len(evts))


asyncio.run(main())
