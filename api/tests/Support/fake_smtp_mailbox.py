#!/usr/bin/env python3
"""Local fake mailbox for proving CaneGuard mail delivery. Never relays anything.

Usage: fake_smtp_mailbox.py PORT CERT KEY OUTDIR
Speaks ESMTP with mandatory STARTTLS on 127.0.0.1 and stores each accepted
message as OUTDIR/<n>.eml. Credentials offered via AUTH are accepted and discarded.
"""
import socket
import ssl
import sys
import threading

port, cert, key, outdir = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)
counter = 0
lock = threading.Lock()


def serve(conn):
    global counter
    f = conn.makefile("rwb", buffering=0)
    tls = False

    def say(line):
        f.write((line + "\r\n").encode())

    say("220 fake-mailbox ESMTP")
    sender, rcpts = "", []
    while True:
        raw = f.readline()
        if not raw:
            return
        cmd = raw.decode(errors="replace").strip()
        verb = cmd.upper()
        if verb.startswith("EHLO") or verb.startswith("HELO"):
            say("250-fake-mailbox")
            if not tls:
                say("250-STARTTLS")
            else:
                say("250-AUTH PLAIN LOGIN")
            say("250 8BITMIME")
        elif verb == "STARTTLS":
            say("220 ready")
            conn = ctx.wrap_socket(conn, server_side=True)
            f = conn.makefile("rwb", buffering=0)
            tls = True
        elif verb.startswith("AUTH"):
            if not tls:
                say("530 STARTTLS required")
            elif verb.startswith("AUTH PLAIN") and len(cmd.split()) > 2:
                say("235 ok")
            elif verb.startswith("AUTH LOGIN"):
                say("334 VXNlcm5hbWU6")
                f.readline()
                say("334 UGFzc3dvcmQ6")
                f.readline()
                say("235 ok")
            else:
                say("235 ok")
        elif verb.startswith("MAIL FROM"):
            if not tls:
                say("530 STARTTLS required")
            else:
                sender, rcpts = cmd[10:].strip(), []
                say("250 ok")
        elif verb.startswith("RCPT TO"):
            rcpts.append(cmd[8:].strip())
            say("250 ok")
        elif verb == "DATA":
            say("354 end with <CRLF>.<CRLF>")
            body = b""
            while True:
                line = f.readline()
                if line in (b".\r\n", b""):
                    break
                body += line[1:] if line.startswith(b"..") else line
            with lock:
                counter += 1
                n = counter
            header = f"X-Fake-Envelope-From: {sender}\r\nX-Fake-Envelope-To: {', '.join(rcpts)}\r\n".encode()
            with open(f"{outdir}/{n}.eml", "wb") as out:
                out.write(header + body)
            say(f"250 ok queued as fake-{n}")
        elif verb == "RSET":
            sender, rcpts = "", []
            say("250 ok")
        elif verb == "NOOP":
            say("250 ok")
        elif verb == "QUIT":
            say("221 bye")
            conn.close()
            return
        else:
            say("502 unsupported")


srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", port))
srv.listen(5)
print("listening", flush=True)
while True:
    c, _ = srv.accept()
    threading.Thread(target=serve, args=(c,), daemon=True).start()
