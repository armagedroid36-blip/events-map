#!/usr/bin/env python3
"""Диагностика: статусы запросов к тайлам, ошибки консоли."""
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
                                      "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == seq:
                    r = msg.get('result', {})
                    if 'exceptionDetails' in r:
                        return 'EXC:' + json.dumps(r['exceptionDetails'])[:300]
                    return r.get('result', {}).get('value')

        # Запросы к planet (векторные тайлы): URL, статус, размер
        perfs = await ev("""
JSON.stringify(performance.getEntriesByType('resource')
  .filter(r => r.name.includes('openfreemap.org/planet') || r.name.includes('tiles.openfreemap'))
  .slice(0, 15)
  .map(r => r.name.split('openfreemap.org/')[1] + ' st=' + (r.responseStatus||'?') + ' sz=' + r.transferSize))
""")
        print('PERF', perfs)
        # Подписка на ошибки консоли + перезагрузка
        await ws.send(json.dumps({"id": 990, "method": "Log.enable"}))
        await ws.recv()
        await ws.send(json.dumps({"id": 991, "method": "Runtime.enable"}))
        await ws.recv()
        logs = []
        async def collect(seconds):
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=seconds))
                    m = msg.get('method', '')
                    if m == 'Log.entryAdded':
                        e = msg['params']['entry']
                        logs.append(e.get('level', '') + ': ' + (e.get('text', '') or '')[:200])
                    elif m == 'Runtime.exceptionThrown':
                        logs.append('EXC: ' + json.dumps(msg['params']['exceptionDetails'].get('text', ''))[:200])
                    elif m == 'Network.loadingFailed':
                        logs.append('NETFAIL: ' + (msg['params'].get('errorText', '') or '') + ' ' + (msg['params'].get('blockedReason', '') or ''))
            except Exception:
                return
        await ev("location.reload()")
        await asyncio.sleep(15)
        await collect(0.3)
        print('LOGS', json.dumps(logs[:12], ensure_ascii=True))


asyncio.run(main())
