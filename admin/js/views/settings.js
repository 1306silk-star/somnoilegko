/**
 * Раздел «Настройки» — безопасность, режим работы, публикация файла контента.
 */

(function registerSettings() {
  "use strict";

  const { h, card, callout, formatDate } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  function securityCard() {
    const values = { current: "", next: "", repeat: "", login: "" };
    const error = h("p", { class: "field__error", hidden: true });

    async function submit(event) {
      const button = event.currentTarget;
      error.hidden = true;

      if (values.next !== values.repeat) {
        error.textContent = "Новый пароль и подтверждение не совпадают";
        error.hidden = false;
        return;
      }

      button.disabled = true;
      button.textContent = "Сохраняем…";

      try {
        await Admin.Auth.changePassword(values.current, values.next, values.login);
        Admin.UI.toast("Пароль обновлён");
        Admin.App.refresh();
      } catch (err) {
        error.textContent = err.message || String(err);
        error.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = "Сменить пароль";
      }
    }

    return card({
      modifier: Admin.Auth.usesDefaultPassword ? "card--accent" : "",
      title: "Доступ в панель",
      subtitle: Admin.Auth.usesDefaultPassword
        ? "Сейчас используется пароль по умолчанию — смените его"
        : `Текущий пользователь: ${Admin.Auth.user ? Admin.Auth.user.login : "—"}`,
      body: [
        F.text({
          label: "Новый логин",
          placeholder: Admin.Auth.user ? Admin.Auth.user.login : "admin",
          hint: "Оставьте пустым, чтобы не менять",
          get: () => values.login,
          set: (value) => {
            values.login = value;
          },
        }),
        F.text({
          label: "Текущий пароль",
          type: "password",
          autocomplete: "current-password",
          get: () => values.current,
          set: (value) => {
            values.current = value;
          },
        }),
        F.row("2", [
          F.text({
            label: "Новый пароль",
            type: "password",
            autocomplete: "new-password",
            hint: "Не короче 8 символов",
            get: () => values.next,
            set: (value) => {
              values.next = value;
            },
          }),
          F.text({
            label: "Повторите новый пароль",
            type: "password",
            autocomplete: "new-password",
            get: () => values.repeat,
            set: (value) => {
              values.repeat = value;
            },
          }),
        ]),
        error,
        h("div", { class: "btn-row mt-4" }, [
          h("button", {
            class: "btn btn--primary",
            type: "button",
            text: "Сменить пароль",
            onClick: submit,
          }),
        ]),
      ],
    });
  }

  function modeCard() {
    const isServer = Store.state.mode === "server";

    return card({
      title: "Режим работы",
      subtitle: isServer
        ? "Сервер панели найден — данные хранятся на сервере"
        : "Локальный режим — данные хранятся в этом браузере",
      body: [
        h("div", { class: "inline" }, [
          isServer
            ? h("span", { class: "badge badge--published", text: "Серверный режим" })
            : h("span", { class: "badge badge--draft", text: "Локальный режим" }),
          Admin.Crypto.isStrong
            ? h("span", { class: "badge badge--muted", text: "Web Crypto доступен" })
            : h("span", { class: "badge badge--error", text: "Web Crypto недоступен" }),
        ]),
        isServer
          ? h("p", {
              class: "text-sm muted mt-4",
              text:
                "Публикация сразу переписывает файл data/content.js, поэтому изменения " +
                "видят все посетители. Планировщик Telegram работает без открытой панели.",
            })
          : h("div", { class: "stack mt-4 text-sm muted" }, [
              h("p", {
                text:
                  "Правки сохраняются в этом браузере и сразу видны вам на сайте. " +
                  "Чтобы их увидели посетители, выгрузите файл контента и положите его " +
                  "в папку data проекта.",
              }),
              h("p", {
                text:
                  "Полноценный серверный режим включается одной командой в папке проекта: " +
                  "python server/app.py — после этого панель открывается по адресу " +
                  "http://localhost:8787/admin и всё сохраняется автоматически.",
              }),
            ]),
        Admin.Crypto.isStrong
          ? null
          : callout("warn", [
              "Браузер не предоставил Web Crypto API — вероятно, страница открыта как файл. ",
              "Хеширование пароля работает в упрощённом режиме. Откройте панель по адресу ",
              h("code", { text: "http://localhost:8787/admin" }),
              " для полной защиты.",
            ]),
      ],
    });
  }

  function publishCard() {
    return card({
      title: "Публикация контента",
      subtitle: "Файл data/content.js — то, что читает сайт",
      body: [
        h("div", { class: "inline" }, [
          h("span", {
            class: "text-sm muted",
            text: `Последняя публикация: ${formatDate(
              Store.state.published && Store.state.published.updatedAt
            )}`,
          }),
        ]),
        h("div", { class: "btn-row mt-4" }, [
          h("button", {
            class: "btn btn--secondary",
            type: "button",
            text: "Выгрузить data/content.js",
            onClick: () => {
              Store.downloadContentFile();
              Admin.UI.toast("Файл контента выгружен");
            },
          }),
          h("button", {
            class: "btn btn--ghost",
            type: "button",
            text: "Скопировать содержимое файла",
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(Store.buildContentFile());
                Admin.UI.toast("Содержимое скопировано в буфер");
              } catch (error) {
                Admin.UI.toast("Браузер не разрешил копирование", "warn");
              }
            },
          }),
        ]),
        h("p", {
          class: "field__hint",
          text:
            "Положите выгруженный файл в папку data проекта вместо старого — сайт сразу " +
            "покажет новые тексты всем посетителям.",
        }),
      ],
    });
  }

  function dangerCard() {
    return card({
      title: "Сброс",
      subtitle: "Осторожные действия с данными",
      body: h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn--ghost",
          type: "button",
          text: "Откатить черновик к опубликованной версии",
          onClick: async () => {
            const confirmed = await Admin.UI.confirm({
              title: "Откатить черновик?",
              text: "Все несохранённые правки будут потеряны и заменены опубликованной версией.",
              confirmLabel: "Откатить",
              danger: true,
            });
            if (!confirmed) return;
            await Store.discardDraft();
            Admin.UI.toast("Черновик откатан");
            Admin.App.refresh();
          },
        }),
        h("button", {
          class: "btn btn--danger",
          type: "button",
          text: "Вернуть исходный контент сайта",
          onClick: async () => {
            const confirmed = await Admin.UI.confirm({
              title: "Вернуть исходный контент?",
              text:
                "Тексты вернутся к тому, что записано в файле data/content.js. " +
                "Правки, не выгруженные в файл, будут потеряны.",
              confirmLabel: "Вернуть исходный",
              danger: true,
            });
            if (!confirmed) return;
            window.localStorage.removeItem(Store.KEYS.draft);
            window.localStorage.removeItem(Store.KEYS.published);
            Admin.UI.toast("Контент сброшен, перезагружаем панель");
            window.setTimeout(() => window.location.reload(), 900);
          },
        }),
      ]),
    });
  }

  function render() {
    return h("div", { class: "stack" }, [
      Admin.Auth.usesDefaultPassword
        ? callout("danger", [
            h("strong", { text: "Пароль по умолчанию всё ещё активен. " }),
            "Смените его прямо здесь — это самое важное действие после установки панели.",
          ])
        : null,
      securityCard(),
      modeCard(),
      publishCard(),
      dangerCard(),
    ]);
  }

  Admin.Router.register({
    id: "settings",
    title: "Настройки",
    eyebrow: "Система",
    nav: "Настройки",
    group: "Система",
    render,
  });
})();
