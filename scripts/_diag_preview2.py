#!/usr/bin/env python3
"""Состояние preview вкладки + все console события."""
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
        print('NO_PAGE', [t['url'][:50] for t in tabs if t.get('type') == 'page'])
        return
    print('URL', page[0]['url'][:80])
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
                    r = msg.get('result', {})
                    if 'exceptionDetails' in r:
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:300]
                    return r.get('result', {}).get('value')

        async def cdp(method, **params):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": method, "params": params}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
                if msg.get('id') == seq:
                    return msg

        print('READY', await ev('document.readyState'))
        print('CANVAS', await ev('document.querySelector(".maplibregl-canvas") !== null'))
        print('CANVAS_COUNT', await ev('document.querySelectorAll("canvas").length'))
        body = await ev('document.body.innerText') or ''
        print('BODY_HAS_MAP', 'События' in body or 'Events' in body)
        ver = [l for l in body.split('\n') if 'v23.09' in l]
        print('VER', ver[:1])
        # перезагрузка с перехватом ВСЕХ console
        await cdp('Runtime.enable')
        logs = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=70))
                    if msg.get('method') == 'Runtime.consoleAPICalled':
                        txt = ' '.join(str(a.get('value', '')) for a in msg['params']['args'])[:150]
                        logs.append(msg['params']['type'] + ': ' + txt)
                    if msg.get('method') == 'Runtime.exceptionThrown':
                        d = msg['params']['exceptionDetails']
                        logs.append('EXC: ' + json.dumps(d.get('text', ''))[:150])
            except Exception:
                return
        task = asyncio.create_task(listener())
        await ev("location.reload()")
        await asyncio.sleep(40)
        task.cancel()
        print('LOGS', json.dumps(logs[:20], ensure_ascii=True))
        print('CANVAS_AFTER', await ev('document.querySelector(".maplibregl-canvas") !== null'))


asyncio.run(main())
