#!/usr/bin/env python3
"""Preview: прочитать #mperr (диагностика маплibre) после reload."""
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

        await ev("location.reload()")
        await asyncio.sleep(30)
        err = await ev("document.getElementById('mperr') ? document.getElementById('mperr').textContent : 'no-box'")
        print('MPERR', json.dumps(err, ensure_ascii=True))
        print('CANVAS', await ev('document.querySelector(".maplibregl-canvas") !== null'))


asyncio.run(main())
