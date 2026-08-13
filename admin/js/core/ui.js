/**
 * Интерфейсные примитивы панели: создание элементов, уведомления,
 * модальные окна и форматирование дат.
 *
 * Текст всегда попадает в DOM через textContent — разметка не собирается
 * из строк, поэтому пользовательский ввод не может сломать страницу.
 */

window.Admin = window.Admin || {};

Admin.UI = (function () {
  "use strict";

  /* ───────────────────── Создание элементов ───────────────────── */

  function h(tag, props, children) {
    const element = document.createElement(tag);
    const options = props || {};

    Object.keys(options).forEach((key) => {
      const value = options[key];
      if (value === undefined || value === null) return;

      const isProperty = key in element && key !== "list" && typeof value !== "object";

      if (value === false && !isProperty) return;

      if (key === "class") element.className = value;
      else if (key === "text") setText(element, value);
      else if (key === "dataset") Object.assign(element.dataset, value);
      else if (key === "style") Object.assign(element.style, value);
      else if (key.startsWith("on") && typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (isProperty) {
        element[key] = value;
      } else {
        element.setAttribute(key, value === true ? "" : value);
      }
    });

    append(element, children);
    return element;
  }

  function append(parent, children) {
    if (children === undefined || children === null || children === false) return parent;
    if (Array.isArray(children)) {
      children.forEach((child) => append(parent, child));
      return parent;
    }
    if (children instanceof Node) {
      parent.appendChild(children);
      return parent;
    }
    parent.appendChild(document.createTextNode(String(children)));
    return parent;
  }

  function setText(element, value) {
    const text = value == null ? "" : String(value);
    element.textContent = "";
    text.split("\n").forEach((line, index) => {
      if (index > 0) element.appendChild(document.createElement("br"));
      element.appendChild(document.createTextNode(line));
    });
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* ───────────────────── Уведомления ───────────────────── */

  function toast(message, type, duration) {
    const container = document.getElementById("toasts");
    if (!container) return;

    const node = h("div", { class: `toast${type ? ` toast--${type}` : ""}` }, [
      h("span", { text: message }),
      h("button", {
        class: "toast__close",
        type: "button",
        "aria-label": "Закрыть уведомление",
        text: "×",
        onClick: () => node.remove(),
      }),
    ]);

    container.appendChild(node);
    window.setTimeout(() => node.remove(), duration || 4200);
  }

  /* ───────────────────── Модальные окна ───────────────────── */

  let modalCloser = null;

  function modal(options) {
    const config = options || {};
    const root = document.getElementById("modal");
    const dialog = root.querySelector(".modal__dialog");
    const title = document.getElementById("modal-title");
    const body = document.getElementById("modal-body");
    const foot = document.getElementById("modal-foot");
    const previousFocus = document.activeElement;

    dialog.classList.toggle("modal__dialog--wide", Boolean(config.wide));
    setText(title, config.title || "");
    clear(body);
    clear(foot);
    append(body, config.body);
    append(foot, config.actions);

    root.hidden = false;
    document.body.classList.add("is-locked");

    function close() {
      root.hidden = true;
      document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKeydown, true);
      root.removeEventListener("click", onClick);
      modalCloser = null;
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
      if (typeof config.onClose === "function") config.onClose();
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [
        ...dialog.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((node) => node.offsetParent !== null);

      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onClick(event) {
      if (event.target.closest("[data-modal-close]")) close();
    }

    document.addEventListener("keydown", onKeydown, true);
    root.addEventListener("click", onClick);
    modalCloser = close;

    window.setTimeout(() => {
      const target =
        dialog.querySelector("[data-autofocus]") ||
        dialog.querySelector("input, textarea, select, button:not(.modal__close)");
      if (target) target.focus();
    }, 40);

    return close;
  }

  function closeModal() {
    if (modalCloser) modalCloser();
  }

  function confirm(options) {
    const config = options || {};
    return new Promise((resolve) => {
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const close = modal({
        title: config.title || "Подтвердите действие",
        body: h("p", { class: "text-sm muted", text: config.text || "" }),
        actions: [
          h("button", {
            class: "btn btn--ghost",
            type: "button",
            text: config.cancelLabel || "Отмена",
            onClick: () => {
              finish(false);
              close();
            },
          }),
          h("button", {
            class: `btn ${config.danger ? "btn--danger" : "btn--primary"}`,
            type: "button",
            text: config.confirmLabel || "Подтвердить",
            "data-autofocus": "",
            onClick: () => {
              finish(true);
              close();
            },
          }),
        ],
        onClose: () => finish(false),
      });
    });
  }

  /* ───────────────────── Форматирование ───────────────────── */

  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return dateFormatter.format(date);
  }

  function relativeTime(value) {
    if (!value) return "";
    const diff = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diff)) return "";
    const minutes = Math.round(diff / 60000);
    if (Math.abs(minutes) < 1) return "только что";
    if (Math.abs(minutes) < 60) return `${minutes} мин назад`;
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return `${hours} ч назад`;
    return formatDate(value);
  }

  /** Преобразует ISO-строку в значение для <input type="datetime-local">. */
  function toLocalInput(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  function fromLocalInput(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function badge(status) {
    const map = {
      published: ["published", "Опубликовано"],
      draft: ["draft", "Черновик"],
      scheduled: ["scheduled", "Запланировано"],
      sent: ["sent", "Отправлено"],
      error: ["error", "Ошибка"],
      active: ["published", "Подключено"],
      disabled: ["muted", "Отключено"],
    };
    const [modifier, label] = map[status] || ["muted", status || "—"];
    return h("span", { class: `badge badge--${modifier}`, text: label });
  }

  function callout(type, children) {
    const marks = { info: "i", warn: "!", danger: "!" };
    return h("div", { class: `callout callout--${type}` }, [
      h("span", { class: "callout__mark", text: marks[type] || "i", "aria-hidden": "true" }),
      h("div", { class: "callout__body" }, children),
    ]);
  }

  function empty(title, text, action) {
    return h("div", { class: "empty" }, [
      h("p", { class: "empty__title", text: title }),
      h("p", { class: "empty__text", text: text }),
      action,
    ]);
  }

  function card(options) {
    const config = options || {};
    const head =
      config.title || config.actions
        ? h("div", { class: "card__head" }, [
            h("div", {}, [
              h("h2", { class: "card__title", text: config.title || "" }),
              config.subtitle
                ? h("p", { class: "card__subtitle", text: config.subtitle })
                : null,
            ]),
            config.actions ? h("div", { class: "btn-row" }, config.actions) : null,
          ])
        : null;

    return h("section", { class: `card${config.modifier ? ` ${config.modifier}` : ""}` }, [
      head,
      config.body,
    ]);
  }

  /**
   * Вкладки внутри раздела. Активная вкладка запоминается на время сессии,
   * поэтому возврат в раздел не сбрасывает место работы.
   */
  function tabs(items, options) {
    const config = options || {};
    const memoryKey = config.memory ? `somnoilegko.admin.tab.${config.memory}` : null;

    const nav = h("div", { class: "tabs", role: "tablist" });
    const panel = h("div", {});
    const root = h("div", {}, [nav, panel]);

    let activeId = items[0] && items[0].id;
    if (memoryKey) {
      const remembered = window.sessionStorage.getItem(memoryKey);
      if (remembered && items.some((item) => item.id === remembered)) activeId = remembered;
    }

    function show(id) {
      activeId = id;
      if (memoryKey) window.sessionStorage.setItem(memoryKey, id);

      nav.querySelectorAll(".tab").forEach((button) => {
        const isActive = button.dataset.tab === id;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });

      const item = items.find((entry) => entry.id === id) || items[0];
      clear(panel);
      append(panel, item.render());
    }

    items.forEach((item) => {
      nav.appendChild(
        h("button", {
          class: "tab",
          type: "button",
          role: "tab",
          dataset: { tab: item.id },
          text: item.label,
          onClick: () => show(item.id),
        })
      );
    });

    show(activeId);
    root.reload = () => show(activeId);
    return root;
  }

  return {
    h,
    append,
    clear,
    setText,
    tabs,
    toast,
    modal,
    closeModal,
    confirm,
    formatDate,
    relativeTime,
    toLocalInput,
    fromLocalInput,
    badge,
    callout,
    empty,
    card,
  };
})();
