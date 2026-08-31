#!/usr/bin/env python3
"""Fetch tilejson из браузера: статус, заголовки, тело."""
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

        async def ev(expr, timeout=30):
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

        res = await ev("""
(async () => {
  try {
    const r = await fetch('https://tiles.openfreemap.org/planet/tilejson.json', {cache: 'no-store'});
    const t = await r.text();
    return 'st=' + r.status + ' len=' + t.length + ' head=' + t.slice(0, 80);
  } catch (e) {
    return 'ERR ' + e.message;
  }
})()
""")
        print('FETCH1', res)
        res2 = await ev("""
(async () => {
  try {
    const r = await fetch('https://tiles.openfreemap.org/planet/20260823_080002_pt/5/25/15.pbf', {cache: 'no-store'});
    const b = await r.arrayBuffer();
    return 'st=' + r.status + ' bytes=' + b.byteLength + ' ct=' + (r.headers.get('content-type') || '?');
  } catch (e) {
    return 'ERR ' + e.message;
  }
})()
""")
        print('FETCH2_PBF', res2)


asyncio.run(main())
