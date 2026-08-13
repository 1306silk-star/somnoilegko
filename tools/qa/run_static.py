"""Прогон панели на статическом хостинге — как на GitHub Pages.

Поднимает обычную раздачу файлов без серверной части: /api там не существует,
поэтому панель обязана перейти в локальный режим, попросить создать доступ
и честно сказать, что публикация не дойдёт до посетителей.
"""

from __future__ import annotations

import functools
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
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
PORT = 8791
BASE = f"http://127.0.0.1:{PORT}"
PASSWORD = "Static-Qa-2026!"

os.makedirs(SHOTS, exist_ok=True)

problems: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"[{'OK ' if condition else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        problems.append(f"{label}: {detail}")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Раздача файлов без логов в консоль."""

    def log_message(self, *args) -> None:  # noqa: D102
        pass

    def handle_one_request(self) -> None:
        # Браузер закрывает соединения на выходе — это не ошибка прогона.
        try:
            super().handle_one_request()
        except ConnectionError:
            self.close_connection = True


class QuietServer(socketserver.ThreadingTCPServer):
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        pass


def serve() -> socketserver.TCPServer:
    handler = functools.partial(QuietHandler, directory=ROOT)
    httpd = QuietServer(("127.0.0.1", PORT), handler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def api_noise(browser: Browser) -> list[dict]:
    """Ошибки консоли, кроме ожидаемого отсутствия /api на статике."""
    return [e for e in browser.errors() if "/api/" not in e.get("text", "")]


def main() -> int:
    httpd = serve()
    browser = Browser(CHROME, port=9230)
    browser.viewport(1440, 900)

    try:
        # ─── 1. Чистый браузер: панель обязана попросить создать доступ ───
        browser.call("Network.clearBrowserCookies")
        browser.navigate(f"{BASE}/admin/", settle=2.0)
        browser.js("localStorage.clear(); sessionStorage.clear();")
        browser.clear_console()
        browser.navigate(f"{BASE}/admin/", settle=2.5)

        check("панель открылась без серверной части",
              browser.js("!document.getElementById('auth-screen').hidden"))
        check("режим локальный",
              browser.js("Admin.Auth.mode") == "local",
              str(browser.js("Admin.Auth.mode")))
        check("панель просит создать доступ", browser.js("Admin.Auth.needsSetup") is True)
        check("кнопка предлагает создание",
              "Созда" in (browser.js("document.getElementById('auth-submit').textContent") or ""),
              browser.js("document.getElementById('auth-submit').textContent"))
        check("подсказка честно говорит о границах локального режима",
              "браузере" in (browser.js("document.getElementById('auth-hint').textContent") or ""),
              browser.js("document.getElementById('auth-hint').textContent"))
        check("нет лишних ошибок консоли", not api_noise(browser),
              json.dumps(api_noise(browser), ensure_ascii=False)[:600])
        browser.screenshot(os.path.join(SHOTS, "static-setup.png"))
        browser.clear_console()

        # ─── 2. Пароля из коробки в панели нет ───
        check("готовый пароль в браузер не записан",
              browser.js("localStorage.getItem('somnoilegko.admin.credentials')") is None)
        for guess in ("somnoilegko", "admin", "password"):
            attempt = browser.js(f"""
              Admin.Auth.login('admin', '{guess}', false)
                .then(() => 'вошли').catch(e => 'отказ: ' + (e.message || e))
            """, timeout=40)
            check(f"пароль «{guess}» не подходит", str(attempt).startswith("отказ"), str(attempt))
        browser.clear_console()

        # ─── 3. Короткий пароль отклоняется, нормальный создаёт доступ ───
        short = browser.js("""
          Admin.Auth.createCredentials('admin', 'korotko', false)
            .then(() => 'создан').catch(e => 'отказ: ' + (e.message || e))
        """, timeout=40)
        check("короткий пароль отклонён", "не короче" in str(short), str(short))

        browser.js(f"""
          document.getElementById('auth-login').value = 'admin';
          document.getElementById('auth-password').value = '{PASSWORD}';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(3.0)
        check("доступ создан и вход выполнен",
              browser.js("!document.getElementById('shell').hidden"))
        check("предупреждения о пароле из коробки нет",
              browser.js("Admin.Auth.usesDefaultPassword") is False)
        check("нет лишних ошибок консоли (после входа)", not api_noise(browser),
              json.dumps(api_noise(browser), ensure_ascii=False)[:600])
        browser.clear_console()

        # ─── 4. Все разделы открываются и на статике ───
        routes = browser.js("Admin.Router.getGroups().flatMap(g => g.items.map(i => i.id))")
        for route in routes:
            browser.js(f"location.hash = '#/{route}'")
            time.sleep(0.9)
            broken = browser.js("""
              [...document.querySelectorAll('#view .callout')]
                .some(n => n.textContent.includes('Раздел не открылся'))
            """)
            empty = browser.js("document.getElementById('view').children.length === 0")
            check(f"раздел «{route}» открылся", not broken and not empty)
        check("нет лишних ошибок консоли (разделы)", not api_noise(browser),
              json.dumps(api_noise(browser), ensure_ascii=False)[:600])
        browser.screenshot(os.path.join(SHOTS, "static-dashboard.png"))
        browser.clear_console()

        # ─── 5. Публикация на статике не дотягивается до сайта ───
        browser.js("location.hash = '#/content'")
        time.sleep(1.0)
        result = browser.js("""
          Admin.Store.publish().then(r => JSON.stringify(r)).catch(e => 'err: ' + (e.message || e))
        """, timeout=40)
        parsed = json.loads(result) if result and result.startswith("{") else {}
        check("публикация в локальном режиме не пишет файл сайта",
              parsed.get("ok") is True and parsed.get("written") is False, str(result))
        check("панель предупреждает о локальном режиме на обзоре",
              browser.js("""(() => {
                location.hash = '#/dashboard';
                return true;
              })()""") is True)
        time.sleep(1.0)
        check("на обзоре виден блок про локальный режим",
              browser.js("""
                [...document.querySelectorAll('#view .callout')]
                  .some(n => n.textContent.includes('Локальный режим'))
              """))

        # ─── 6. Сессия и повторный вход ───
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        check("сессия сохраняется после перезагрузки",
              browser.js("!document.getElementById('shell').hidden"))
        browser.js("document.getElementById('logout-button').click()")
        time.sleep(2.5)
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        check("после выхода снова экран входа",
              browser.js("!document.getElementById('auth-screen').hidden"))
        check("повторно создавать доступ не просят",
              browser.js("Admin.Auth.needsSetup") is False)
        browser.js(f"""
          document.getElementById('auth-login').value = 'admin';
          document.getElementById('auth-password').value = '{PASSWORD}';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(3.0)
        check("вход созданным паролем работает",
              browser.js("!document.getElementById('shell').hidden"))

        # ─── 7. Сайт на статике не пострадал ───
        browser.clear_console()
        browser.navigate(f"{BASE}/", settle=2.5)
        site = browser.js("""({
          hero: (document.querySelector('[data-cms="hero.eyebrow"]') || {}).textContent || '',
          nav: document.querySelectorAll('[data-cms-list="nav"] a').length,
          projects: document.querySelectorAll('[data-cms-list="projects"] > *').length,
          faq: document.querySelectorAll('.faq-item').length,
          modal: !!document.getElementById('contact-modal')
        })""")
        check("сайт отдаёт контент",
              bool(site["hero"].strip()) and site["nav"] > 0
              and site["projects"] > 0 and site["faq"] > 0 and site["modal"],
              json.dumps(site, ensure_ascii=False))
        check("консоль сайта чистая", not api_noise(browser),
              json.dumps(api_noise(browser), ensure_ascii=False)[:600])
        browser.screenshot(os.path.join(SHOTS, "static-site.png"))

        # ─── 8. Доступ прежних версий под паролем из коробки сбрасывается ───
        browser.navigate(f"{BASE}/admin/", settle=2.0)
        browser.js("""(() => {
          const raw = localStorage.getItem('somnoilegko.admin.credentials');
          const record = JSON.parse(raw);
          record.isDefault = true;
          localStorage.setItem('somnoilegko.admin.credentials', JSON.stringify(record));
        })()""")
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        check("доступ под паролем из коробки сброшен",
              browser.js("Admin.Auth.needsSetup") is True)
        check("прежняя запись удалена",
              browser.js("localStorage.getItem('somnoilegko.admin.credentials')") is None)
        check("вход требует нового доступа",
              browser.js("!document.getElementById('auth-screen').hidden"))

        # ─── 9. Локальные данные теста не остаются в браузере ───
        browser.js("localStorage.clear(); sessionStorage.clear();")

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
    print("Статический хостинг: замечаний нет.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
