"""Проверка сквозных сценариев: черновики, предпросмотр, CRUD, интеграции."""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa: E402

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


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"[{'OK ' if condition else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        problems.append(f"{label}: {detail}")


def login(browser: Browser) -> None:
    browser.navigate(f"{BASE}/admin/", settle=2.2)
    if browser.js("!document.getElementById('shell').hidden"):
        return
    browser.js("""
      document.getElementById('auth-login').value = 'admin';
      document.getElementById('auth-password').value = 'somnoilegko';
      document.getElementById('auth-form').requestSubmit();
    """)
    time.sleep(2.5)


def main() -> int:
    browser = Browser(CHROME)
    browser.viewport(1440, 900)

    try:
        login(browser)
        check("вход выполнен", browser.js("!document.getElementById('shell').hidden"))

        # ─── 1. Черновик не попадает на сайт до публикации ─────────
        draft_text = "ЧЕРНОВИК-НЕ-ПУБЛИКОВАТЬ"
        published_before = browser.js("Admin.Store.state.published.hero.eyebrow")
        browser.js(f"Admin.Store.setField('hero.eyebrow', {json.dumps(draft_text)})")
        browser.js("Admin.Store.saveDraft()")
        time.sleep(1.2)

        browser.navigate(f"{BASE}/?t={int(time.time())}", settle=1.8)
        public_value = browser.js(
            "document.querySelector('[data-cms=\"hero.eyebrow\"]').textContent.trim()"
        )
        check("черновик не виден посетителям", public_value != draft_text, public_value)

        browser.navigate(f"{BASE}/?cms-preview=1&t={int(time.time())}", settle=1.8)
        preview_value = browser.js(
            "document.querySelector('[data-cms=\"hero.eyebrow\"]').textContent.trim()"
        )
        check("предпросмотр показывает черновик", preview_value == draft_text, preview_value)
        check("нет ошибок в предпросмотре", not browser.errors(),
              json.dumps(browser.errors(), ensure_ascii=False)[:400])
        browser.clear_console()

        # ─── 2. Откат черновика ────────────────────────────────────
        login(browser)
        browser.js("Admin.Store.discardDraft()")
        time.sleep(1.4)
        reverted = browser.js("Admin.Store.getField('hero.eyebrow')")
        check("откат черновика возвращает опубликованное",
              reverted == published_before, f"{reverted!r} vs {published_before!r}")

        # ─── 3. CRUD в разделе FAQ ─────────────────────────────────
        browser.js("location.hash = '#/faq'")
        time.sleep(1.3)
        before = browser.js("(Admin.Store.getField('faq.items') || []).length")
        added = browser.js("""(() => {
          const btn = [...document.querySelectorAll('#view button')]
            .find(b => /Добавить/i.test(b.textContent));
          if (btn) btn.click();
          return !!btn;
        })()""")
        time.sleep(1.2)
        after_add = browser.js("(Admin.Store.getField('faq.items') || []).length")
        check("кнопка добавления найдена", added is True)
        check("запись создаётся", after_add == before + 1, f"{before} → {after_add}")

        browser.js("""(() => {
          const items = Admin.Store.getField('faq.items');
          items[items.length - 1].question = 'Автотест: вопрос';
          items[items.length - 1].answer = 'Автотест: ответ';
          items[items.length - 1].status = 'published';
          Admin.Store.setField('faq.items', items);
        })()""")
        time.sleep(0.6)
        check("запись редактируется",
              browser.js("Admin.Store.getField('faq.items').at(-1).question") == "Автотест: вопрос")

        browser.js("Admin.Store.publish()")
        time.sleep(2.2)
        browser.navigate(f"{BASE}/?t={int(time.time())}", settle=1.8)
        on_site = browser.js(
            "[...document.querySelectorAll('.faq-item__question, .faq-item__trigger')]"
            ".some(n => n.textContent.includes('Автотест'))"
        )
        check("новая запись видна на сайте", on_site is True)

        login(browser)
        browser.js("""(() => {
          const items = Admin.Store.getField('faq.items').filter(i => !/Автотест/.test(i.question || ''));
          Admin.Store.setField('faq.items', items);
        })()""")
        browser.js("Admin.Store.publish()")
        time.sleep(2.2)
        after_delete = browser.js("(Admin.Store.getField('faq.items') || []).length")
        check("запись удаляется", after_delete == before, f"{after_delete} vs {before}")

        browser.navigate(f"{BASE}/?t={int(time.time())}", settle=1.8)
        gone = browser.js(
            "![...document.querySelectorAll('.faq-item')].some(n => n.textContent.includes('Автотест'))"
        )
        check("удалённая запись исчезла с сайта", gone is True)

        # ─── 4. SEO доезжает до сайта ──────────────────────────────
        login(browser)
        original_title = browser.js("Admin.Store.getField('seo.title')")
        original_og = browser.js("Admin.Store.getField('seo.ogTitle')")
        browser.js("Admin.Store.setField('seo.title', 'Автотест SEO — Сомной_легко')")
        browser.js("Admin.Store.setField('seo.ogTitle', 'Автотест OG — Сомной_легко')")
        browser.js("Admin.Store.publish()")
        time.sleep(2.2)
        browser.navigate(f"{BASE}/?t={int(time.time())}", settle=1.8)
        check("SEO-заголовок применяется",
              browser.js("document.title") == "Автотест SEO — Сомной_легко",
              browser.js("document.title"))
        check("og:title синхронизирован",
              "Автотест OG" in (browser.js(
                  "(document.querySelector('meta[property=\"og:title\"]') || {}).content || ''"
              ) or ""))
        login(browser)
        browser.js(f"Admin.Store.setField('seo.title', {json.dumps(original_title)})")
        browser.js(f"Admin.Store.setField('seo.ogTitle', {json.dumps(original_og)})")
        browser.js("Admin.Store.publish()")
        time.sleep(2.0)

        # ─── 5. Telegram без токена — понятная ошибка ──────────────
        browser.js("location.hash = '#/telegram/settings'")
        time.sleep(1.2)
        token_ui = browser.js("""(() => {
          const text = document.getElementById('view').textContent;
          return {
            token: /токен/i.test(text),
            chat: /chat|канал|чат/i.test(text),
            inputs: document.querySelectorAll('#view input, #view select').length
          };
        })()""")
        check("настройки Telegram содержат поля токена и канала",
              token_ui["token"] and token_ui["chat"] and token_ui["inputs"] >= 2, str(token_ui))

        verified = browser.js("""
          fetch('/api/telegram/verify', { method: 'POST', credentials: 'include',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: '{}' })
            .then(async r => ({ status: r.status, body: await r.json() }))
        """, timeout=40)
        check("отсутствие токена — понятная ошибка 400",
              verified["status"] == 400 and "окен" in verified["body"].get("error", ""),
              json.dumps(verified, ensure_ascii=False))
        check("нет необработанных ошибок в Telegram",
              not [e for e in browser.errors() if e["type"] == "exception"],
              json.dumps(browser.errors(), ensure_ascii=False)[:400])
        browser.clear_console()

        # ─── 6. AI: запуск инструмента вручную ─────────────────────
        browser.js("location.hash = '#/ai'")
        time.sleep(1.3)
        opened_tool = browser.js("""(() => {
          const btn = [...document.querySelectorAll('#view button')]
            .find(b => /Запустить|Открыть|Выполнить/i.test(b.textContent));
          if (btn) btn.click();
          return btn ? btn.textContent.trim() : null;
        })()""")
        time.sleep(1.0)
        check("инструмент AI открывается", bool(opened_tool), str(opened_tool))
        check("окно инструмента показано",
              browser.js("!document.getElementById('modal').hidden"))

        browser.js("""(() => {
          document.querySelectorAll('#modal input[type="text"], #modal textarea').forEach(node => {
            node.value = 'автотест';
            node.dispatchEvent(new Event('input', { bubbles: true }));
          });
          const run = [...document.querySelectorAll('#modal button')]
            .find(b => /Выполнить/i.test(b.textContent));
          if (run) run.click();
        })()""")
        time.sleep(2.5)
        output = browser.js("(document.querySelector('.ai-output') || {}).textContent || ''")
        check("AI формирует готовый запрос", len(output) > 30 and "Результат появится" not in output,
              output[:160])
        history = browser.js("(Admin.Store.getModule('ai').history || []).length")
        check("запуск записан в историю", history >= 1, f"записей={history}")
        browser.js("Admin.UI.closeModal()")
        time.sleep(0.4)
        check("нет исключений в AI",
              not [e for e in browser.errors() if e["type"] == "exception"],
              json.dumps(browser.errors(), ensure_ascii=False)[:400])
        browser.clear_console()

        # ─── 7. Приложения: внешнее приложение подключено ──────────
        browser.js("location.hash = '#/apps'")
        time.sleep(1.3)
        apps = browser.js("""(() => {
          const text = document.getElementById('view').textContent;
          return {
            time: text.includes('time.somnoilegko.ru'),
            links: [...document.querySelectorAll('#view a[href]')]
              .map(a => a.getAttribute('href'))
              .filter(h => h.startsWith('http'))
          };
        })()""")
        check("приложение time.somnoilegko.ru подключено", apps["time"] is True, str(apps))
        check("ведёт на внешний адрес",
              any("time.somnoilegko.ru" in link for link in apps["links"]), str(apps["links"]))

        target = browser.js("""(() => {
          const link = [...document.querySelectorAll('#view a')]
            .find(a => /Открыть в панели/i.test(a.textContent));
          if (link) link.click();
          return link ? link.getAttribute('href') : null;
        })()""")
        check("есть переход во встроенное окно", bool(target), str(target))
        time.sleep(4.0)

        frame = browser.js("""(() => {
          const iframe = document.querySelector('#view iframe');
          if (!iframe) return null;
          return {
            src: iframe.getAttribute('src'),
            sandbox: iframe.getAttribute('sandbox'),
            referrer: iframe.getAttribute('referrerpolicy'),
            width: Math.round(iframe.getBoundingClientRect().width),
            height: Math.round(iframe.getBoundingClientRect().height)
          };
        })()""")
        check("встроенное приложение отрисовано", bool(frame), str(frame))
        if frame:
            check("iframe ограничен sandbox", "allow-scripts" in (frame.get("sandbox") or ""),
                  str(frame.get("sandbox")))
            check("iframe указывает на внешнее приложение",
                  "time.somnoilegko.ru" in (frame.get("src") or ""), str(frame.get("src")))
            check("окно приложения имеет размер",
                  frame["width"] > 200 and frame["height"] > 200, str(frame))
        check("возврат к списку приложений", browser.js("""(() => {
          const back = [...document.querySelectorAll('#view a')]
            .find(a => /Все приложения/i.test(a.textContent));
          if (back) back.click();
          return !!back;
        })()""") is True)
        time.sleep(1.0)
        browser.screenshot(os.path.join(SHOTS, "admin-apps.png"))
        browser.clear_console()

        # ─── 8. Смена пароля и вход с новым ────────────────────────
        browser.js("location.hash = '#/settings'")
        time.sleep(1.3)
        changed = browser.js("""
          Admin.Auth.changePassword('somnoilegko', 'Qa-Test-2026!')
            .then(() => 'ok').catch(e => 'err: ' + (e.message || e))
        """, timeout=40)
        check("пароль меняется", changed == "ok", str(changed))
        time.sleep(1.0)

        browser.navigate(f"{BASE}/admin/", settle=2.5)
        browser.js("""(() => {
          const logout = document.getElementById('logout-button');
          if (logout && !document.getElementById('shell').hidden) logout.click();
        })()""")
        time.sleep(3.0)
        browser.navigate(f"{BASE}/admin/", settle=2.5)
        browser.js("""
          document.getElementById('auth-login').value = 'admin';
          document.getElementById('auth-password').value = 'somnoilegko';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(2.0)
        check("старый пароль больше не подходит",
              browser.js("!document.getElementById('auth-error').hidden"))

        browser.js("""
          document.getElementById('auth-password').value = 'Qa-Test-2026!';
          document.getElementById('auth-form').requestSubmit();
        """)
        time.sleep(2.5)
        check("вход с новым паролем", browser.js("!document.getElementById('shell').hidden"))

        restored = browser.js("""
          Admin.Auth.changePassword('Qa-Test-2026!', 'somnoilegko')
            .then(() => 'ok').catch(e => 'err: ' + (e.message || e))
        """, timeout=40)
        check("пароль возвращён к исходному", restored == "ok", str(restored))
        browser.clear_console()

        # ─── 9. Клик по каждой кнопке каждого раздела ──────────────
        login(browser)
        routes = browser.js("Admin.Router.getGroups().flatMap(g => g.items.map(i => i.id))")
        for route in routes:
            browser.js(f"location.hash = '#/{route}'")
            time.sleep(1.0)
            total = browser.js("""document.querySelectorAll(
              '#view button:not([disabled])'
            ).length""")
            for index in range(min(total, 14)):
                clicked = browser.js(f"""(() => {{
                  const buttons = document.querySelectorAll('#view button:not([disabled])');
                  const btn = buttons[{index}];
                  if (!btn) return 'нет';
                  const label = (btn.textContent || '').trim()
                    + ' ' + (btn.getAttribute('aria-label') || '')
                    + ' ' + (btn.getAttribute('title') || '');
                  if (/Удалить|Опубликовать|Отправить|Сбросить|Вернуть|Выгрузить|Скачать|Очистить|Дублировать/i.test(label))
                    return 'пропуск';
                  btn.click();
                  return label || 'без подписи';
                }})()""")
                time.sleep(0.35)
                if clicked in ("нет", "пропуск"):
                    continue
                broken = browser.js(
                    "document.getElementById('view').textContent.includes('Раздел не открылся')"
                )
                if broken:
                    check(f"кнопка «{clicked}» в #/{route}", False, "раздел упал")
                browser.js("""(() => {
                  const modal = document.getElementById('modal');
                  if (modal && !modal.hidden) Admin.UI.closeModal();
                })()""")
            exceptions = [e for e in browser.errors() if e["type"] == "exception"]
            check(f"кнопки раздела #/{route} без исключений", not exceptions,
                  json.dumps(exceptions, ensure_ascii=False)[:400])
            browser.clear_console()

    finally:
        browser.close()

    print("\n" + "=" * 60)
    if problems:
        print(f"ПРОБЛЕМ: {len(problems)}")
        for problem in problems:
            print(f"  x {problem}")
        return 1
    print("Все сценарии пройдены")
    return 0


if __name__ == "__main__":
    sys.exit(main())
