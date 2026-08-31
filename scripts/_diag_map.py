#!/usr/bin/env python3
"""Диагностика главной карты: что на странице, есть ли канвасы/ошибки."""
import json
import urllib.request
import asyncio
import websockets

PORT = 9223
URL_FILTER = 'github.io'


def get_tabs():
    return json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=10))


async def main():
    tabs = get_tabs()
    page = [t for t in tabs if URL_FILTER in t.get('url', '')]
    if not page:
        print('NO_PAGE', [t['url'][:60] for t in tabs if t.get('type') == 'page'])
        return
    ws_url = page[0]['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=2 ** 26) as ws:
        seq = 0

        async def ev(expr, timeout=30):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": "Runtime.evaluate",
                                      "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == seq:
                    r = msg.get('result', {})
                    if 'exceptionDetails' in r:
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:400]
                    return r.get('result', {}).get('value')

        print('URL', page[0]['url'][:100])
        print('READY', await ev('document.readyState'))
        print('CANVAS_COUNT', await ev('document.querySelectorAll("canvas").length'))
        print('BODY', json.dumps((await ev('document.body.innerText') or '')[:300], ensure_ascii=True))
        print('VERSION', await ev("[...document.querySelectorAll('div')].map(d => d.innerText).find(t => (t||'').includes('v23.09')) || 'none'"))
        # JS-ошибки: подпишемся на console (только новые события) и перезагрузим
        await ws.send(json.dumps({"id": 999, "method": "Runtime.enable"}))
        await ws.recv()
        logs = []
        async def collect():
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=0.3))
                    if msg.get('method') == 'Runtime.consoleAPICalled':
                        logs.append(msg['params']['type'] + ': ' + ' '.join(str(a.get('value', '')) for a in msg['params']['args'])[:200])
                    if msg.get('method') == 'Runtime.exceptionThrown':
                        logs.append('EXC: ' + json.dumps(msg['params']['exceptionDetails'].get('text', ''))[:300])
            except Exception:
                pass
        await ev("location.reload()")
        await asyncio.sleep(12)
        await collect()
        print('CANVAS_AFTER', await ev('document.querySelectorAll("canvas").length'))
        print('MAPLIBRE_CANVAS', await ev('document.querySelector(".maplibregl-canvas") !== null'))
        print('LOGS', json.dumps(logs[:8], ensure_ascii=True))


asyncio.run(main())
