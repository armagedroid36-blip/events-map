#!/usr/bin/env python3
"""Preview: есть ли кадр в WebGL канвасе (drawImage в 2D + dataURL)."""
import json
import urllib.request
import asyncio
import base64
import websockets

PORT = 9225
URL_FILTER = '127.0.0.1:4173'
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

        # drawImage из webgl-канваса в 2D и вернуть dataURL (сохранить в файл)
        durl = await ev("""
(() => {
  const c = document.querySelector('.maplibregl-canvas');
  if (!c) return 'no';
  const c2 = document.createElement('canvas');
  c2.width = c.width; c2.height = c.height;
  const ctx = c2.getContext('2d');
  try { ctx.drawImage(c, 0, 0); } catch (e) { return 'drawfail ' + e.message; }
  return c2.toDataURL('image/png');
})()
""")
        print('DURL_LEN', len(durl or ''))
        if durl and durl.startswith('data:image/png;base64,'):
            with open(TMP + '\\canvas_frame.png', 'wb') as f:
                f.write(base64.b64decode(durl.split(',')[1]))
            print('FRAME_SAVED')
        else:
            print('DURL_HEAD', (durl or '')[:80])


asyncio.run(main())
