#!/usr/bin/env python3
"""PBF-запросы после reload + состояние маплibre-источника."""
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
                                      "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == seq:
                    r = msg.get('result', {})
                    if 'exceptionDetails' in r:
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:300]
                    return r.get('result', {}).get('value')

        # Сброс кэша и reload
        await ev("location.reload()")
        await asyncio.sleep(20)
        pbf = await ev("performance.getEntriesByType('resource').filter(r => r.name.includes('.pbf')).map(r => r.name.split('/planet/')[1] + ' st=' + (r.responseStatus||'?') + ' sz=' + r.transferSize).slice(0, 10)")
        print('PBF_ENTRIES', json.dumps(pbf, ensure_ascii=True))
        pbfn = await ev("performance.getEntriesByType('resource').filter(r => r.name.includes('.pbf')).length")
        print('PBF_COUNT', pbfn)
        # Проверим через маплibre-данные: queryRenderedFeatures недоступен, но можно проверить
        # наличие <style> и пиксель ещё раз
        px = await ev("""
(() => {
  const c = document.querySelector('.maplibregl-canvas');
  if (!c) return 'no-canvas';
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no-gl';
  const buf = new Uint8Array(4);
  gl.readPixels(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return 'center=' + [...buf].join(',');
})()
""")
        print('PX', px)


asyncio.run(main())
