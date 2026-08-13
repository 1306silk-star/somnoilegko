r"""Прогон панели за обратным прокси — та же схема, что на сервере.

На сервере наружу смотрит nginx, а приложение слушает только localhost
(см. deploy/nginx.conf и deploy/somnoilegko.service). Этот прогон поднимает
такой же прокси и проверяет, что за ним всё работает: вход, признак HTTPS
у сессионной куки, разделы, публикация и сайт.

Перед запуском поднимите приложение с "trustProxy": true, например так:

    set ADMIN_CONFIG=%TEMP%\qa\config.json
    set ADMIN_DATA=%TEMP%\qa\data
    set ADMIN_PORT=8788
    python server/app.py

    python tools/qa/run_proxy.py
"""

from __future__ import annotations

import http.client
import http.server
import json
import os
import socketserver
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa: E402

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
UPSTREAM_PORT = int(os.environ.get("QA_UPSTREAM_PORT", "8788"))
PROXY_PORT = int(os.environ.get("QA_PROXY_PORT", "8790"))
BASE = f"http://127.0.0.1:{PROXY_PORT}"
DOMAIN = "somnoilegko.ru"

os.makedirs(SHOTS, exist_ok=True)

problems: list[str] = []

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"[{'OK ' if condition else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        problems.append(f"{label}: {detail}")


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    """Передаёт запрос дальше с теми же заголовками, что nginx."""

    protocol_version = "HTTP/1.1"

    def log_message(self, *args) -> None:
        pass

    def relay(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP and key.lower() != "content-length"
        }
        headers["Host"] = DOMAIN
        headers["X-Real-IP"] = self.client_address[0]
        headers["X-Forwarded-For"] = self.client_address[0]
        headers["X-Forwarded-Proto"] = "https"
        headers["X-Forwarded-Host"] = DOMAIN
        if body is not None:
            headers["Content-Length"] = str(len(body))

        upstream = http.client.HTTPConnection("127.0.0.1", UPSTREAM_PORT, timeout=30)
        try:
            upstream.request(self.command, self.path, body=body, headers=headers)
            response = upstream.getresponse()
            payload = response.read()

            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() in HOP_BY_HOP or key.lower() == "content-length":
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except OSError as error:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(error).encode("utf-8"))
        finally:
            upstream.close()

    do_GET = relay
    do_POST = relay
    do_PUT = relay
    do_DELETE = relay
    do_HEAD = relay
    do_OPTIONS = relay


class ProxyServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address) -> None:
        pass


def main() -> int:
    try:
        upstream = http.client.HTTPConnection("127.0.0.1", UPSTREAM_PORT, timeout=5)
        upstream.request("GET", "/api/health")
        alive = upstream.getresponse().status == 200
        upstream.close()
    except OSError:
        alive = False

    if not alive:
        print(f"Приложение на 127.0.0.1:{UPSTREAM_PORT} не отвечает — сначала запустите его.")
        return 1

    httpd = ProxyServer(("127.0.0.1", PROXY_PORT), ProxyHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"прокси {PROXY_PORT} → приложение {UPSTREAM_PORT}, X-Forwarded-Proto: https\n")

    browser = Browser(CHROME, port=9235)
    browser.viewport(1440, 900)

    try:
        browser.call("Network.clearBrowserCookies")
        browser.navigate(f"{BASE}/admin/", settle=2.0)
        browser.js("localStorage.clear(); sessionStorage.clear();")
        browser.clear_console()

        browser.navigate(f"{BASE}/admin", settle=2.5)
        check("панель открывается через прокси",
              browser.js("!document.getElementById('auth-screen').hidden"))
        check("серверный режим определён",
              "подключена к серверу" in (
                  browser.js("document.getElementById('auth-hint').textContent") or ""),
              browser.js("document.getElementById('auth-hint').textContent"))
        check("доступ создавать не просят (пароль на сервере)",
              browser.js("Admin.Auth.needsSetup") is False)

        guarded = browser.js("fetch('/api/state/content').then(r => r.status)")
        check("API закрыт без сессии", guarded == 401, f"статус={guarded}")
        browser.clear_console()

        browser.js("""
          document.getElementById('auth-login').value = 'admin';
          document.getElementById('auth-password').value = 'somnoilegko';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(3.0)
        check("вход через прокси выполнен",
              browser.js("!document.getElementById('shell').hidden"))
        check("данные идут с сервера",
              browser.js("Admin.Store.state.mode") == "server",
              str(browser.js("Admin.Store.state.mode")))
        check("сессионная кука недоступна из JS",
              "session" not in (browser.js("document.cookie") or "").lower(),
              repr(browser.js("document.cookie")))

        cookies = browser.call("Network.getCookies", {"urls": [BASE]})
        session_cookies = [
            c for c in cookies.get("cookies", []) if c["name"].startswith("somnoilegko")
        ]
        check("кука выдана", bool(session_cookies), str(cookies))
        if session_cookies:
            cookie = session_cookies[0]
            check("кука помечена Secure (прокси сообщил про HTTPS)", cookie.get("secure") is True,
                  json.dumps({k: cookie.get(k) for k in ("secure", "httpOnly", "sameSite")}))
            check("кука HttpOnly", cookie.get("httpOnly") is True)
            check("кука SameSite=Strict", cookie.get("sameSite") == "Strict",
                  str(cookie.get("sameSite")))
        check("нет ошибок консоли (вход)", not browser.errors(),
              json.dumps(browser.errors(), ensure_ascii=False)[:400])
        browser.clear_console()

        routes = browser.js("Admin.Router.getGroups().flatMap(g => g.items.map(i => i.id))")
        broken = []
        for route in routes:
            browser.js(f"location.hash = '#/{route}'")
            time.sleep(0.8)
            if browser.js("""
              document.getElementById('view').children.length === 0 ||
              [...document.querySelectorAll('#view .callout')]
                .some(n => n.textContent.includes('Раздел не открылся'))
            """):
                broken.append(route)
        check(f"все разделы открываются ({len(routes)})", not broken, str(broken))
        check("нет ошибок консоли (разделы)", not browser.errors(),
              json.dumps(browser.errors(), ensure_ascii=False)[:400])
        browser.screenshot(os.path.join(SHOTS, "proxy-dashboard.png"))
        browser.clear_console()

        marker = f"ПРОКСИ-ПРОВЕРКА-{int(time.time())}"
        original = browser.js("Admin.Store.getField('hero.eyebrow')")
        browser.js(f"Admin.Store.setField('hero.eyebrow', {json.dumps(marker)})")
        published = browser.js("""
          Admin.Store.publish().then(r => JSON.stringify(r)).catch(e => 'err: ' + (e.message || e))
        """, timeout=40)
        parsed = json.loads(published) if str(published).startswith("{") else {}
        check("публикация переписывает файл сайта", parsed.get("written") is True, str(published))

        browser.navigate(f"{BASE}/?t={int(time.time())}", settle=2.5)
        on_site = browser.js(
            "(document.querySelector('[data-cms=\"hero.eyebrow\"]') || {}).textContent || ''"
        )
        check("правка сразу видна на сайте", marker in on_site, on_site.strip()[:60])
        check("сайт через прокси без ошибок", not browser.errors(),
              json.dumps(browser.errors(), ensure_ascii=False)[:400])
        browser.screenshot(os.path.join(SHOTS, "proxy-site.png"))

        browser.navigate(f"{BASE}/admin/", settle=2.5)
        check("сессия жива после перезагрузки",
              browser.js("!document.getElementById('shell').hidden"))
        browser.js(f"Admin.Store.setField('hero.eyebrow', {json.dumps(original)})")
        browser.js("Admin.Store.publish()")
        time.sleep(2.0)
        restored = browser.js("Admin.Store.getField('hero.eyebrow')")
        check("правка откачена", restored == original, f"{restored!r}")

        browser.js("document.getElementById('logout-button').click()")
        time.sleep(3.0)
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        check("после выхода снова экран входа",
              browser.js("!document.getElementById('auth-screen').hidden"))
        check("нет ошибок консоли (выход)", not browser.errors(),
              json.dumps(browser.errors(), ensure_ascii=False)[:400])

    finally:
        browser.close()
        httpd.shutdown()
        httpd.server_close()

    print()
    if problems:
        print(f"Проблемы ({len(problems)}):")
        for item in problems:
            print(f"  - {item}")
        return 1
    print("За обратным прокси: замечаний нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
