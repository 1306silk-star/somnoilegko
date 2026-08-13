"""Полный прогон панели управления: вход, маршруты, формы, публикация, адаптивность."""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa: E402

# Консоль Windows по умолчанию в cp1251 — переключаем вывод на UTF-8.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
# Адрес можно переопределить, если проверяемый экземпляр поднят на другом порту.
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8787")
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(SHOTS, exist_ok=True)

problems: list[str] = []
notes: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "OK " if condition else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        problems.append(f"{label}: {detail}")


def console_check(browser: Browser, label: str) -> None:
    errors = browser.errors()
    check(f"консоль чистая ({label})", not errors, json.dumps(errors, ensure_ascii=False)[:900])
    browser.clear_console()


def main() -> int:
    browser = Browser(CHROME)
    browser.viewport(1440, 900)

    try:
        # ─── 1. Вход ───────────────────────────────────────────────
        # Профиль браузера переиспользуется между запусками, поэтому
        # начинаем как гость: без куки и без локальных данных панели.
        browser.call("Network.clearBrowserCookies")
        browser.navigate(f"{BASE}/admin/", settle=1.5)
        browser.js("localStorage.clear(); sessionStorage.clear();")
        browser.clear_console()

        browser.navigate(f"{BASE}/admin", settle=2.0)
        check("редирект /admin → /admin/", browser.js("location.pathname") == "/admin/",
              browser.js("location.pathname"))
        check("экран входа показан", browser.js("!document.getElementById('auth-screen').hidden"))
        check("режим сервера определён",
              "сервер" in (browser.js("document.getElementById('auth-hint').textContent") or ""))
        console_check(browser, "экран входа")

        guarded = browser.js("""
          fetch('/api/state/content', { credentials: 'include' }).then(r => r.status)
        """)
        check("API закрыт без сессии", guarded == 401, f"статус={guarded}")
        browser.clear_console()

        browser.js("""
          document.getElementById('auth-login').value = 'admin';
          document.getElementById('auth-password').value = 'wrong-pass';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(1.5)
        check("неверный пароль отклонён",
              browser.js("!document.getElementById('auth-error').hidden"),
              browser.js("document.getElementById('auth-error').textContent"))
        browser.clear_console()

        browser.js("""
          document.getElementById('auth-login').value = 'admin';
          document.getElementById('auth-password').value = 'somnoilegko';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(2.5)
        check("вход выполнен", browser.js("!document.getElementById('shell').hidden"))
        check("режим хранилища серверный",
              browser.js("Admin.Store.state.mode") == "server",
              str(browser.js("Admin.Store.state.mode")))
        cookies = browser.js("document.cookie")
        check("сессионная кука недоступна из JS (HttpOnly)",
              "session" not in (cookies or "").lower(), repr(cookies))
        check("панель закрыта от индексации",
              browser.js("!!document.querySelector('meta[name=\"robots\"]')"))
        console_check(browser, "после входа")

        # ─── 2. Маршруты ───────────────────────────────────────────
        routes = browser.js(
            "Admin.Router.getGroups().flatMap(g => g.items.map(i => i.id))"
        )
        print(f"\nРазделов в меню: {len(routes)} → {routes}\n")

        for route in routes:
            browser.js(f"location.hash = '#/{route}'")
            time.sleep(1.1)
            info = browser.js("""(() => {
              const view = document.getElementById('view');
              return {
                nodes: view.children.length,
                text: view.textContent.trim().length,
                fail: view.textContent.includes('Раздел не открылся'),
                title: document.getElementById('view-title').textContent,
                active: !!document.querySelector('.sidebar__link.is-active'),
                controls: view.querySelectorAll('input, textarea, select, button, a').length
              };
            })()""")
            ok = info["nodes"] > 0 and info["text"] > 40 and not info["fail"] and info["active"]
            check(
                f"раздел #/{route}",
                ok,
                f"узлов={info['nodes']} символов={info['text']} контролов={info['controls']} "
                f"ошибка={info['fail']} заголовок={info['title']}",
            )
            console_check(browser, f"#/{route}")

        # ─── 3. Вкладки внутри разделов ────────────────────────────
        browser.js("location.hash = '#/content'")
        time.sleep(1.2)
        tabs = browser.js("[...document.querySelectorAll('.tabs .tab')].map(b => b.textContent)")
        check("вкладки контента найдены", len(tabs or []) >= 5, str(tabs))
        for index in range(len(tabs or [])):
            browser.js(f"document.querySelectorAll('.tabs .tab')[{index}].click()")
            time.sleep(0.5)
            filled = browser.js(
                "document.querySelector('.tabs').nextElementSibling.textContent.trim().length"
            )
            active = browser.js(
                f"document.querySelectorAll('.tabs .tab')[{index}].classList.contains('is-active')"
            )
            check(f"вкладка «{tabs[index]}»", filled > 20 and active is True,
                  f"символов={filled} активна={active}")
        console_check(browser, "вкладки контента")

        # ─── 4. Редактирование и публикация ────────────────────────
        original = browser.js("Admin.Store.getField('hero.eyebrow')")
        probe_value = "ТЕСТ-ПРОВЕРКА ПУБЛИКАЦИИ"
        browser.js(f"Admin.Store.setField('hero.eyebrow', {json.dumps(probe_value)})")
        time.sleep(0.4)
        check("правка помечает черновик", browser.js("Admin.Store.state.dirty") is True)
        check(
            "индикатор сохранения переключился",
            browser.js("document.getElementById('save-state').dataset.state") in ("dirty", "saving"),
            str(browser.js("document.getElementById('save-state').dataset.state")),
        )

        browser.js("Admin.Store.saveDraft()")
        time.sleep(1.0)
        browser.js("document.getElementById('publish-button').click()")
        time.sleep(2.5)
        check("после публикации черновик чист", browser.js("Admin.Store.state.dirty") is False)
        console_check(browser, "публикация")

        # ─── 5. Сайт получил правку ────────────────────────────────
        browser.navigate(f"{BASE}/?nocache={int(time.time())}", settle=2.0)
        on_site = browser.js("document.querySelector('[data-cms=\"hero.eyebrow\"]').textContent")
        check("правка видна на сайте", on_site.strip() == probe_value, on_site)
        console_check(browser, "сайт после публикации")

        # ─── 6. Откат правки ───────────────────────────────────────
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        browser.js(f"Admin.Store.setField('hero.eyebrow', {json.dumps(original)})")
        browser.js("Admin.Store.saveDraft()")
        time.sleep(0.8)
        browser.js("Admin.Store.publish()")
        time.sleep(2.0)
        browser.navigate(f"{BASE}/?nocache={int(time.time())}", settle=1.8)
        restored = browser.js("document.querySelector('[data-cms=\"hero.eyebrow\"]').textContent")
        check("правка откачена", restored.strip() == original.strip(), restored)

        # ─── 7. Сессия переживает перезагрузку ─────────────────────
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        check("сессия сохранена после перезагрузки",
              browser.js("!document.getElementById('shell').hidden"))
        console_check(browser, "восстановление сессии")

        # ─── 8. Кнопки и формы Telegram ────────────────────────────
        browser.js("location.hash = '#/telegram/new'")
        time.sleep(1.3)
        browser.js("""(() => {
          const area = document.querySelector('#view textarea');
          area.value = 'Тестовый пост из автопроверки';
          area.dispatchEvent(new Event('input', { bubbles: true }));
        })()""")
        time.sleep(1.4)
        preview = browser.js(
            "(document.querySelector('.tg-preview__bubble') || {}).textContent || ''"
        )
        check("предпросмотр Telegram обновляется", "автопроверки" in preview, preview[:120])
        counter = browser.js("(document.querySelector('.tg-counter') || {}).textContent || ''")
        check("счётчик символов работает", any(ch.isdigit() for ch in counter), counter)

        saved = browser.js("""(() => {
          const buttons = [...document.querySelectorAll('#view button')];
          const save = buttons.find(b => /Сохранить/i.test(b.textContent));
          if (save) save.click();
          return !!save;
        })()""")
        check("кнопка сохранения поста найдена", saved is True)
        time.sleep(1.8)
        posts = browser.js("(Admin.Store.getModule('telegram').posts || []).length")
        check("пост попал в библиотеку", posts >= 1, f"постов={posts}")
        console_check(browser, "telegram")

        browser.js("location.hash = '#/telegram'")
        time.sleep(1.2)
        filters = browser.js("document.querySelectorAll('#view .tabs .tab').length")
        check("фильтры библиотеки отрисованы", filters >= 3, f"кнопок={filters}")
        for index in range(max(filters, 0)):
            browser.js(f"document.querySelectorAll('#view .tabs .tab')[{index}].click()")
            time.sleep(0.4)
            broke = browser.js("document.getElementById('view').textContent.includes('Раздел не открылся')")
            check(f"фильтр библиотеки #{index + 1}", broke is False)
        console_check(browser, "библиотека telegram")

        # ─── 9. Модальные окна ─────────────────────────────────────
        browser.js("location.hash = '#/brand-os'")
        time.sleep(1.2)
        opened = browser.js("""(() => {
          const btn = [...document.querySelectorAll('#view button')]
            .find(b => /Открыть|Читать|Просмотр/i.test(b.textContent));
          if (btn) btn.click();
          return !!btn;
        })()""")
        time.sleep(0.7)
        if opened:
            check("модальное окно открывается",
                  browser.js("!document.getElementById('modal').hidden"))
            browser.js("document.querySelector('#modal [data-modal-close]').click()")
            time.sleep(0.5)
            check("модальное окно закрывается",
                  browser.js("document.getElementById('modal').hidden") is True)
        else:
            notes.append("В Brand OS нет документов для проверки модального окна")
        console_check(browser, "brand-os")

        # ─── 10. Все ссылки боковой панели кликабельны ─────────────
        broken = browser.js("""(() => {
          const bad = [];
          document.querySelectorAll('#view a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href || href === '#' || href === 'undefined' || href.includes('undefined')) {
              bad.push(a.textContent.trim() + ' → ' + href);
            }
          });
          return bad;
        })()""")
        check("нет битых ссылок в текущем разделе", not broken, str(broken))

        # ─── 11. Адаптивность ──────────────────────────────────────
        for width, height, name in ((1440, 900, "desktop"), (834, 1112, "tablet"), (375, 812, "mobile")):
            browser.viewport(width, height, mobile=width < 900)
            browser.js("location.hash = '#/dashboard'")
            time.sleep(1.0)
            overflow = browser.js("""(() => {
              const doc = document.documentElement;
              const wide = [];
              document.querySelectorAll('#view *').forEach(node => {
                const rect = node.getBoundingClientRect();
                if (rect.width > 0 && rect.right > doc.clientWidth + 2) {
                  wide.push((node.className || node.tagName) + ' → ' + Math.round(rect.right));
                }
              });
              return { scroll: doc.scrollWidth, client: doc.clientWidth, wide: wide.slice(0, 5) };
            })()""")
            check(
                f"нет горизонтального переполнения ({name} {width}px)",
                overflow["scroll"] <= overflow["client"] + 2,
                f"scrollWidth={overflow['scroll']} clientWidth={overflow['client']} {overflow['wide']}",
            )
            browser.screenshot(os.path.join(SHOTS, f"admin-{name}.png"))

        # мобильное меню
        browser.viewport(375, 812, mobile=True)
        time.sleep(0.5)
        burger_visible = browser.js(
            "getComputedStyle(document.getElementById('sidebar-open')).display !== 'none'"
        )
        check("бургер виден на мобильном", burger_visible is True)
        browser.js("document.getElementById('sidebar-open').click()")
        time.sleep(0.6)
        check("меню открывается",
              browser.js("document.getElementById('sidebar').classList.contains('is-open')"))
        browser.screenshot(os.path.join(SHOTS, "admin-mobile-menu.png"))
        browser.js("document.getElementById('shell-scrim').click()")
        time.sleep(0.5)
        check("меню закрывается по клику на подложку",
              browser.js("!document.getElementById('sidebar').classList.contains('is-open')"))
        console_check(browser, "адаптивность")

        # ─── 12. Сайт: адаптивность и регресс ──────────────────────
        for width, height, name in ((1440, 900, "desktop"), (375, 812, "mobile")):
            browser.viewport(width, height, mobile=width < 900)
            browser.navigate(f"{BASE}/", settle=2.2)
            state = browser.js("""(() => {
              const doc = document.documentElement;
              return {
                scroll: doc.scrollWidth,
                client: doc.clientWidth,
                hero: document.querySelectorAll('.hero__word-text').length,
                faq: document.querySelectorAll('.faq-item').length,
                projects: document.querySelectorAll('[data-cms-list="projects"] > *').length,
                nav: document.querySelectorAll('.site-nav__link').length,
                ready: document.documentElement.classList.contains('is-ready')
              };
            })()""")
            check(
                f"сайт без переполнения ({name})",
                state["scroll"] <= state["client"] + 2,
                f"{state['scroll']}/{state['client']}",
            )
            check(
                f"контент сайта на месте ({name})",
                state["hero"] >= 4 and state["faq"] >= 4 and state["projects"] >= 2 and state["nav"] >= 5,
                str(state),
            )
            browser.screenshot(os.path.join(SHOTS, f"site-{name}.png"))
            console_check(browser, f"сайт {name}")

        # интерактив сайта
        browser.viewport(1440, 900)
        browser.navigate(f"{BASE}/", settle=2.0)
        browser.js("document.querySelector('.faq-item__trigger').click()")
        time.sleep(0.6)
        check("аккордеон FAQ работает",
              browser.js("document.querySelector('.faq-item').classList.contains('is-open')"))
        opened_modal = browser.js("""(() => {
          const btn = document.querySelector('[data-contact-modal], [data-action="contact"]')
            || [...document.querySelectorAll('button')].find(b => /Написать|Обсудить/i.test(b.textContent));
          if (btn) btn.click();
          return !!btn;
        })()""")
        time.sleep(0.7)
        if opened_modal:
            check("модальное окно контактов открывается",
                  browser.js("!!document.querySelector('.contact-modal.is-open, #contact-modal:not([hidden])')"),
                  "проверьте вручную")
        console_check(browser, "интерактив сайта")

        # ─── 13. Выход ─────────────────────────────────────────────
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        browser.js("document.getElementById('logout-button').click()")
        # Выход перезагружает страницу, поэтому ждём, пока документ снова оживёт.
        visible = False
        for _ in range(20):
            time.sleep(0.6)
            try:
                visible = browser.js(
                    "!!document.getElementById('auth-screen') && "
                    "!document.getElementById('auth-screen').hidden"
                )
            except RuntimeError:
                visible = False
            if visible:
                break
        check("после выхода показан экран входа", visible is True)
        browser.navigate(f"{BASE}/admin/", settle=2.2)
        check("защита разделов после выхода",
              browser.js("document.getElementById('shell').hidden") is True)
        console_check(browser, "выход")

    finally:
        browser.close()

    print("\n" + "=" * 60)
    if notes:
        print("Примечания:")
        for note in notes:
            print(f"  · {note}")
    if problems:
        print(f"ПРОБЛЕМ: {len(problems)}")
        for problem in problems:
            print(f"  ✗ {problem}")
        return 1
    print("Все проверки пройдены")
    return 0


if __name__ == "__main__":
    sys.exit(main())
