#!/usr/bin/env python3
"""Preview 9226: открыть форму кликом, проверить мини-карту."""
import json
import urllib.request
import asyncio
import websockets

PORT = 9226
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

        # Найти и кликнуть кнопку создания события
        clicked = await ev("(() => { const b = [...document.querySelectorAll('button')].find(x => /Создать|Разместить|create|submit/i.test(x.textContent || '')); if (b) { b.click(); return b.textContent.trim(); } return 'none'; })()")
        print('CLICKED', clicked)
        await asyncio.sleep(8)
        print('FORM', await ev("document.querySelector('form') !== null"))
        print('CANVASES', await ev('document.querySelectorAll("canvas").length'))
        print('MARKERS', await ev('document.querySelectorAll(".maplibregl-marker").length'))
        print('ATTR', json.dumps(await ev("[...document.querySelectorAll('.maplibregl-ctrl-attrib')].map(e => e.innerText).join(' | ')"), ensure_ascii=True))


asyncio.run(main())
