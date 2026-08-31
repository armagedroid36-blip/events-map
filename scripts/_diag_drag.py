#!/usr/bin/env python3
"""Версия бандла + drag для триггера тайлов + перехват."""
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

        # Версия и состояние
        body = await ev('document.body.innerText') or ''
        ver = [l for l in body.split('\n') if 'v23.09' in l]
        print('VERSION_LINE', ver[:1])
        print('ATTRIB', await ev('document.querySelector(".maplibregl-ctrl-attrib") !== null'))
        print('CANVAS_STYLE', await ev("(() => { const c = document.querySelector('.maplibregl-canvas'); return c ? getComputedStyle(c).width + 'x' + getComputedStyle(c).height : 'none'; })()"))

        # Перехват + drag
        await cdp('Network.enable')
        reqs = []
        async def listener():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=50))
                    if msg.get('method') == 'Network.requestWillBeSent':
                        u = msg['params']['request'].get('url', '')
                        if 'openfreemap' in u:
                            reqs.append(u[8:110])
                    if msg.get('method') == 'Network.responseReceived':
                        u = msg['params']['response'].get('url', '')
                        if 'openfreemap' in u:
                            reqs.append('<- st=' + str(msg['params']['response'].get('status')) + ' ' + u[8:90])
            except Exception:
                return
        task = asyncio.create_task(listener())
        r = await ev("(() => { const c = document.querySelector('.maplibregl-canvas'); const b = c.getBoundingClientRect(); return {x: b.x + b.width/2, y: b.y + b.height/2}; })()")
        x, y = int(r['x']), int(r['y'])
        # drag вправо-вниз (перемещение карты)
        await cdp('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y, button='left', clickCount=1)
        for i in range(1, 6):
            await cdp('Input.dispatchMouseEvent', type='mouseMoved', x=x + i * 40, y=y + i * 25, button='left')
            await asyncio.sleep(0.15)
        await cdp('Input.dispatchMouseEvent', type='mouseReleased', x=x + 200, y=y + 125, button='left', clickCount=1)
        await asyncio.sleep(12)
        task.cancel()
        print('REQS', json.dumps(reqs[:20], ensure_ascii=True))
        print('REQ_COUNT', len(reqs))


asyncio.run(main())
