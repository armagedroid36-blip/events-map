#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""IMAP-доступ к ящику проекта (Яндекс.Почта) для подтверждения регистраций.

Пароль берётся по порядку:
  1) файл  C:\\Users\\armag\\Desktop\\yandex_app_pass.txt  (одна строка)
  2) переменная окружения YANDEX_APP_PASS

Использование:
  python mail-imap.py list [N]            # последние N писем (по умолчанию 10)
  python mail-imap.py search <подстрока>  # письма, где подстрока в теме/отправителе
  python mail-imap.py links [N]           # ссылки-подтверждения из последних N писем
"""
import email, imaplib, os, re, sys, html
from email.header import decode_header

USER = "cozyloftt@yandex.ru"
HOST = "imap.yandex.ru"
PASSFILE = r"C:\Users\armag\Desktop\yandex_app_pass.txt"


def get_pass():
    if os.path.exists(PASSFILE):
        p = open(PASSFILE, encoding="utf-8").read().strip()
        if p:
            return p
    p = os.environ.get("YANDEX_APP_PASS", "").strip()
    if p:
        return p
    sys.exit("НЕТ ПАРОЛЯ: положи пароль приложения в " + PASSFILE + " (одна строка)")


def dec(s):
    if not s:
        return ""
    parts = decode_header(s)
    out = ""
    for t, enc in parts:
        out += t.decode(enc or "utf-8", "ignore") if isinstance(t, bytes) else t
    return out


def connect():
    m = imaplib.IMAP4_SSL(HOST, 993, timeout=60)
    m.login(USER, get_pass())
    m.select("INBOX")
    return m


def fetch(m, ids):
    out = []
    for i in reversed(ids):
        typ, data = m.fetch(i, "(RFC822)")
        if typ != "OK":
            continue
        msg = email.message_from_bytes(data[0][1])
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() in ("text/plain", "text/html"):
                    try:
                        body += part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore")
                    except Exception:
                        pass
        else:
            try:
                body = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "ignore")
            except Exception:
                pass
        out.append({
            "id": i.decode() if isinstance(i, bytes) else str(i),
            "from": dec(msg.get("From")),
            "subject": dec(msg.get("Subject")),
            "date": msg.get("Date"),
            "body": body,
        })
    return out


def cmd_list(n=10):
    m = connect()
    typ, data = m.search(None, "ALL")
    ids = data[0].split()[-n:]
    for r in fetch(m, ids):
        print(f"[{r['id']}] {r['date']} | {r['from'][:45]} | {r['subject'][:70]}")
    m.logout()


def cmd_search(term, n=10):
    m = connect()
    typ, data = m.search(None, "ALL")
    ids = data[0].split()[-200:]
    hits = []
    for r in fetch(m, ids):
        if term.lower() in (r["subject"] + r["from"] + r["body"]).lower():
            hits.append(r)
    for r in hits[-n:]:
        print(f"[{r['id']}] {r['date']} | {r['from'][:45]} | {r['subject'][:70]}")
    if not hits:
        print("ничего не найдено по:", term)
    m.logout()


def cmd_links(n=10):
    m = connect()
    typ, data = m.search(None, "ALL")
    ids = data[0].split()[-n:]
    for r in fetch(m, ids):
        links = re.findall(r'https?://[^\s"\'<>\)]+', r["body"])
        links = [html.unescape(l).rstrip(".,") for l in links]
        keep = [l for l in links if not re.search(r"(unsubscribe|logo|facebook|twitter|instagram|yandex\.ru/support)", l, re.I)]
        print(f"[{r['id']}] {r['subject'][:60]}")
        for l in dict.fromkeys(keep[:6]):
            print("   ", l[:160])
    m.logout()


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "list":
        cmd_list(int(a[1]) if len(a) > 1 else 10)
    elif a[0] == "search":
        cmd_search(a[1], int(a[2]) if len(a) > 2 else 10)
    elif a[0] == "links":
        cmd_links(int(a[1]) if len(a) > 1 else 10)
    else:
        print(__doc__)
