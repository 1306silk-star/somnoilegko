/**
 * Точка входа панели управления.
 *
 * Порядок запуска: определяем режим (сервер или локально) → поднимаем авторизацию →
 * показываем вход или рабочую область → загружаем данные → включаем маршрутизацию.
 */

window.Admin = window.Admin || {};

Admin.App = (function () {
  "use strict";

  const { h } = Admin.UI;
  const Store = Admin.Store;

  const dom = {};
  let currentRender = null;

  function cache() {
    dom.boot = document.getElementById("boot-screen");
    dom.auth = document.getElementById("auth-screen");
    dom.shell = document.getElementById("shell");
    dom.scrim = document.getElementById("shell-scrim");
    dom.sidebar = document.getElementById("sidebar");
    dom.sidebarNav = document.getElementById("sidebar-nav");
    dom.view = document.getElementById("view");
    dom.title = document.getElementById("view-title");
    dom.eyebrow = document.getElementById("view-eyebrow");
    dom.saveState = document.getElementById("save-state");
    dom.publish = document.getElementById("publish-button");
    dom.logout = document.getElementById("logout-button");
    dom.userName = document.getElementById("user-name");
    dom.userAvatar = document.getElementById("user-avatar");
    dom.storageMode = document.getElementById("storage-mode");
    dom.form = document.getElementById("auth-form");
    dom.error = document.getElementById("auth-error");
    dom.hint = document.getElementById("auth-hint");
    dom.authTitle = document.querySelector(".auth-form__title");
    dom.authEyebrow = document.querySelector(".auth-form__eyebrow");
    dom.authSubtitle = document.querySelector(".auth-form__subtitle");
    dom.authSubmit = document.getElementById("auth-submit");
    dom.authPassword = document.getElementById("auth-password");
  }

  /**
   * Первый вход в локальном режиме: доступ создаётся руками.
   *
   * Пароля из коробки здесь нет — панель может быть открыта на публичном
   * адресе, и известный пароль означал бы открытую дверь.
   */
  function applySetupMode() {
    const setup = Admin.Auth.needsSetup;

    Admin.UI.setText(dom.authEyebrow, setup ? "Первый запуск" : "Вход в систему");
    Admin.UI.setText(dom.authTitle, setup ? "Создайте доступ" : "Панель управления");
    Admin.UI.setText(
      dom.authSubtitle,
      setup
        ? "Придумайте логин и пароль — они сохранятся только в этом браузере."
        : "Введите логин и пароль администратора."
    );
    Admin.UI.setText(dom.authSubmit, setup ? "Создать доступ и войти" : "Войти");

    dom.authPassword.setAttribute(
      "autocomplete",
      setup ? "new-password" : "current-password"
    );
    dom.authPassword.setAttribute(
      "placeholder",
      setup ? `Не короче ${Admin.Auth.MIN_PASSWORD} символов` : ""
    );
  }

  /* ───────────────────── Экраны ───────────────────── */

  function showBoot() {
    dom.boot.hidden = false;
    dom.auth.hidden = true;
    dom.shell.hidden = true;
  }

  function showAuth() {
    dom.boot.hidden = true;
    dom.auth.hidden = false;
    dom.shell.hidden = true;
    document.body.classList.remove("is-booting");
    window.setTimeout(() => document.getElementById("auth-login").focus(), 60);
  }

  function showShell() {
    dom.boot.hidden = true;
    dom.auth.hidden = true;
    dom.shell.hidden = false;
    document.body.classList.remove("is-booting");
  }

  /* ───────────────────── Боковое меню ───────────────────── */

  function buildSidebar() {
    Admin.UI.clear(dom.sidebarNav);

    Admin.Router.getGroups().forEach((group) => {
      if (group.title) {
        dom.sidebarNav.appendChild(h("p", { class: "sidebar__group", text: group.title }));
      }
      group.items.forEach((route) => {
        dom.sidebarNav.appendChild(
          h("a", {
            class: "sidebar__link",
            href: `#/${route.id}`,
            dataset: { route: route.id },
            text: route.nav,
          })
        );
      });
    });
  }

  function highlightSidebar(routeId) {
    dom.sidebarNav.querySelectorAll(".sidebar__link").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.route === routeId);
    });
  }

  function openSidebar() {
    dom.sidebar.classList.add("is-open");
    dom.scrim.hidden = false;
    document.getElementById("sidebar-open").setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    dom.sidebar.classList.remove("is-open");
    dom.scrim.hidden = true;
    document.getElementById("sidebar-open").setAttribute("aria-expanded", "false");
  }

  /* ───────────────────── Отрисовка раздела ───────────────────── */

  function renderRoute(resolved) {
    const { route, params, query } = resolved;
    if (!route) return;

    currentRender = () => renderRoute(resolved);

    Admin.UI.setText(dom.title, route.title);
    Admin.UI.setText(dom.eyebrow, route.eyebrow || "Панель");
    document.title = `${route.title} · Панель управления`;
    highlightSidebar(route.id);
    closeSidebar();

    Admin.UI.clear(dom.view);
    try {
      Admin.UI.append(dom.view, route.render(params, query));
    } catch (error) {
      console.error("[app] Ошибка отрисовки раздела", error);
      Admin.UI.append(
        dom.view,
        Admin.UI.callout("danger", [
          h("strong", { text: "Раздел не открылся. " }),
          "Подробности — в консоли браузера. Попробуйте обновить страницу.",
        ])
      );
    }

    if (typeof route.onEnter === "function") route.onEnter();

    // Прокрутка вверх без scrollIntoView: иначе начало раздела уезжает
    // под липкую шапку.
    window.scrollTo({ top: 0 });
    dom.view.focus({ preventScroll: true });
  }

  function refresh() {
    if (currentRender) currentRender();
  }

  /* ───────────────────── Состояние сохранения ───────────────────── */

  function updateSaveState(event) {
    if (!dom.saveState) return;

    if (event === "saving") {
      dom.saveState.dataset.state = "saving";
      Admin.UI.setText(dom.saveState, "Сохраняем…");
      return;
    }

    if (Store.state.dirty) {
      dom.saveState.dataset.state = "dirty";
      Admin.UI.setText(dom.saveState, "Есть неопубликованные правки");
    } else {
      dom.saveState.dataset.state = "saved";
      Admin.UI.setText(dom.saveState, "Всё опубликовано");
    }
  }

  /* ───────────────────── Действия оболочки ───────────────────── */

  function bindShell() {
    document.getElementById("sidebar-open").addEventListener("click", openSidebar);
    document.getElementById("sidebar-close").addEventListener("click", closeSidebar);
    dom.scrim.addEventListener("click", closeSidebar);

    dom.publish.addEventListener("click", async () => {
      dom.publish.disabled = true;
      const label = dom.publish.textContent;
      dom.publish.textContent = "Публикуем…";

      try {
        const result = await Store.publish();
        if (result && result.written) {
          Admin.UI.toast("Опубликовано — сайт обновлён");
        } else {
          Admin.UI.toast(
            "Опубликовано в этом браузере. Чтобы правки увидели посетители, выгрузите data/content.js в настройках.",
            "warn",
            7000
          );
        }
        refresh();
      } catch (error) {
        console.error(error);
        Admin.UI.toast(`Не удалось опубликовать: ${error.message || error}`, "error", 6000);
      } finally {
        dom.publish.disabled = false;
        dom.publish.textContent = label;
      }
    });

    dom.logout.addEventListener("click", async () => {
      const confirmed = Store.state.dirty
        ? await Admin.UI.confirm({
            title: "Выйти из панели?",
            text: "Есть неопубликованные правки. Черновик сохранится, но на сайт не попадёт.",
            confirmLabel: "Выйти",
          })
        : true;
      if (!confirmed) return;

      await Store.saveDraft().catch(() => {});
      await Admin.Auth.logout();
      window.location.hash = "";
      window.location.reload();
    });

    Admin.Auth.onIdle(async () => {
      await Store.saveDraft().catch(() => {});
      await Admin.Auth.logout();
      Admin.UI.toast("Сессия завершена из-за бездействия", "warn", 6000);
      window.setTimeout(() => window.location.reload(), 1200);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!Store.state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  /* ───────────────────── Вход ───────────────────── */

  function bindAuthForm() {
    const toggle = document.getElementById("auth-password-toggle");
    const password = document.getElementById("auth-password");

    toggle.addEventListener("click", () => {
      const visible = password.type === "text";
      password.type = visible ? "password" : "text";
      toggle.textContent = visible ? "Показать" : "Скрыть";
      toggle.setAttribute("aria-label", visible ? "Показать пароль" : "Скрыть пароль");
    });

    dom.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = document.getElementById("auth-submit");
      const login = document.getElementById("auth-login").value.trim();
      const remember = document.getElementById("auth-remember").checked;

      const setup = Admin.Auth.needsSetup;

      dom.error.hidden = true;
      submit.disabled = true;
      submit.textContent = setup ? "Создаём…" : "Проверяем…";

      try {
        if (setup) await Admin.Auth.createCredentials(login, password.value, remember);
        else await Admin.Auth.login(login, password.value, remember);
        password.value = "";
        await enterApp();
      } catch (error) {
        Admin.UI.setText(dom.error, error.message || "Не удалось войти");
        dom.error.hidden = false;
        password.focus();
        password.select();
      } finally {
        submit.disabled = false;
        // Подпись кнопки зависит от того, создан ли доступ: неудачный вход
        // мог обнаружить, что его ещё нет.
        applySetupMode();
      }
    });
  }

  /* ───────────────────── Запуск рабочей области ───────────────────── */

  async function enterApp() {
    showBoot();

    await Store.init(Admin.Auth.mode);

    dom.userName.textContent = Admin.Auth.user ? Admin.Auth.user.login : "—";
    dom.userAvatar.textContent = (Admin.Auth.user ? Admin.Auth.user.login : "A")
      .charAt(0)
      .toUpperCase();
    dom.storageMode.textContent =
      Store.state.mode === "server" ? "серверный режим" : "локальный режим";

    buildSidebar();
    updateSaveState();

    Store.subscribe((event) => updateSaveState(event));

    showShell();
    Admin.Router.start(renderRoute);

    document.dispatchEvent(new CustomEvent("admin:ready"));

    if (Admin.Auth.usesDefaultPassword) {
      Admin.UI.toast("Смените пароль по умолчанию в разделе «Настройки»", "warn", 8000);
    }
  }

  /* ───────────────────── Инициализация ───────────────────── */

  async function start() {
    cache();
    bindAuthForm();
    bindShell();

    const serverAvailable = await Admin.Api.probe();
    const mode = serverAvailable ? "server" : "local";

    try {
      const user = await Admin.Auth.init(mode);

      Admin.UI.setText(
        dom.hint,
        serverAvailable
          ? "Панель подключена к серверу. Данные и публикация — на стороне сервера."
          : "Сервер панели не найден. Здесь можно готовить правки и смотреть " +
              "предпросмотр, но они останутся в этом браузере: чтобы изменения " +
              "увидели посетители, нужен запущенный сервер панели."
      );
      applySetupMode();

      if (user) await enterApp();
      else showAuth();
    } catch (error) {
      console.error("[app] Не удалось запустить панель", error);
      showAuth();
      Admin.UI.setText(dom.error, "Панель запустилась с ошибкой. Подробности в консоли.");
      dom.error.hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  return { refresh, closeSidebar };
})();
