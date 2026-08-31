#!/usr/bin/env python3
"""Проверка рендера: readPixels из центра canvas + снимок без GPU-флага."""
import json
import urllib.request
import asyncio
import base64
import websockets

PORT = 9223
URL_FILTER = 'github.io'
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
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:300]
                    return r.get('result', {}).get('value')

        async def cdp(method, **params):
            nonlocal seq
            seq += 1
            await ws.send(json.dumps({"id": seq, "method": method, "params": params}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if msg.get('id') == seq:
                    return msg

        # Пиксели в 4 точках канваса (readPixels)
        px = await ev("""
(() => {
  const c = document.querySelector('.maplibregl-canvas');
  if (!c) return 'no-canvas';
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no-gl';
  const out = [];
  const pts = [[0.5,0.5],[0.5,0.2],[0.2,0.5],[0.8,0.8]];
  const buf = new Uint8Array(4);
  for (const [fx,fy] of pts) {
    gl.readPixels(Math.floor(c.width*fx), Math.floor(c.height*fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    out.push([...buf].join(','));
  }
  return out.join(' | ');
})()
""")
        print('PIXELS', px)
        print('CANVAS_SIZE', await ev("(() => { const c = document.querySelector('.maplibregl-canvas'); return c ? c.width + 'x' + c.height : 'none'; })()"))
        # Снимок всей страницы (не только viewport)
        s = await cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
        with open(TMP + '\\map_px.png', 'wb') as f:
            f.write(base64.b64decode(s['result']['data']))
        print('SHOT_OK')


asyncio.run(main())
