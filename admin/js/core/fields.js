/**
 * Конструктор полей формы.
 *
 * Любое поле умеет работать в двух режимах:
 *   • path  — значение читается и пишется в контент сайта через Admin.Store;
 *   • get / set — значение живёт в произвольном объекте (посты, документы и т.д.).
 *
 * Так один набор компонентов обслуживает и редактор сайта, и вспомогательные модули.
 */

window.Admin = window.Admin || {};

Admin.Fields = (function () {
  "use strict";

  const { h } = Admin.UI;
  const Store = Admin.Store;

  function reader(config) {
    if (typeof config.get === "function") return config.get;
    return () => Store.getField(config.path, config.fallback ?? "");
  }

  function writer(config) {
    if (typeof config.set === "function") {
      return (value) => {
        config.set(value);
        if (config.onChange) config.onChange(value);
      };
    }
    return (value) => {
      Store.setField(config.path, value);
      if (config.onChange) config.onChange(value);
    };
  }

  const FORM_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

  function wrap(config, control, extra) {
    const isFormControl = FORM_TAGS.includes(control.tagName);
    const id = config.id || `field-${Math.random().toString(36).slice(2, 9)}`;
    if (isFormControl) control.id = id;

    const label = config.label
      ? isFormControl
        ? h("label", { class: "field__label", for: id, text: config.label })
        : h("p", { class: "field__label", text: config.label })
      : null;

    return h("div", { class: `field${config.className ? ` ${config.className}` : ""}` }, [
      label,
      control,
      extra,
      config.hint ? h("p", { class: "field__hint", text: config.hint }) : null,
    ]);
  }

  /* ───────────────────── Базовые поля ───────────────────── */

  function text(config) {
    const get = reader(config);
    const set = writer(config);

    const input = h("input", {
      class: "field__input",
      type: config.type || "text",
      value: get() ?? "",
      placeholder: config.placeholder || "",
      autocomplete: config.autocomplete || "off",
      spellcheck: config.type !== "url",
      onInput: (event) => set(event.target.value),
    });

    return wrap(config, input);
  }

  function url(config) {
    return text({ ...config, type: "url", placeholder: config.placeholder || "https://" });
  }

  function textarea(config) {
    const get = reader(config);
    const set = writer(config);

    const control = h("textarea", {
      class: `field__textarea${config.tall ? " field__textarea--tall" : ""}`,
      rows: config.rows || undefined,
      placeholder: config.placeholder || "",
      onInput: (event) => {
        set(event.target.value);
        if (config.onInput) config.onInput(event.target.value);
      },
    });
    control.value = get() ?? "";

    return wrap(config, control);
  }

  function select(config) {
    const get = reader(config);
    const set = writer(config);
    const current = get();

    const control = h(
      "select",
      {
        class: "field__select",
        onChange: (event) => set(event.target.value),
      },
      (config.options || []).map((option) =>
        h("option", {
          value: option.value,
          text: option.label,
          selected: String(option.value) === String(current),
        })
      )
    );

    return wrap(config, control);
  }

  function checkbox(config) {
    const get = reader(config);
    const set = writer(config);

    const input = h("input", {
      type: "checkbox",
      checked: Boolean(get()),
      onChange: (event) => set(event.target.checked),
    });

    return h("label", { class: `checkbox${config.className ? ` ${config.className}` : ""}` }, [
      input,
      h("span", { text: config.label }),
    ]);
  }

  function row(modifier, children) {
    return h("div", { class: `field-row field-row--${modifier}` }, children);
  }

  /* ───────────────────── Список строк ───────────────────── */

  function stringList(config) {
    const get = reader(config);
    const set = writer(config);

    const list = h("div", { class: "string-list" });

    function render() {
      Admin.UI.clear(list);
      const values = get() || [];

      values.forEach((value, index) => {
        list.appendChild(
          h("div", { class: "string-list__item" }, [
            h("input", {
              class: "field__input",
              type: "text",
              value,
              placeholder: config.placeholder || "",
              onInput: (event) => {
                const next = [...(get() || [])];
                next[index] = event.target.value;
                set(next);
              },
            }),
            h("button", {
              class: "string-list__remove",
              type: "button",
              "aria-label": "Удалить строку",
              text: "×",
              onClick: () => {
                const next = [...(get() || [])];
                next.splice(index, 1);
                set(next);
                render();
              },
            }),
          ])
        );
      });

      if (!values.length) {
        list.appendChild(
          h("p", { class: "field__hint", text: config.emptyText || "Пока пусто" })
        );
      }

      list.appendChild(
        h("button", {
          class: "btn btn--ghost btn--sm mt-2",
          type: "button",
          text: config.addLabel || "Добавить строку",
          onClick: () => {
            set([...(get() || []), ""]);
            render();
            const inputs = list.querySelectorAll(".field__input");
            if (inputs.length) inputs[inputs.length - 1].focus();
          },
        })
      );
    }

    render();
    return wrap(config, list);
  }

  /* ───────────────────── Повторяющиеся блоки ───────────────────── */

  /**
   * Универсальный редактор массива объектов: сворачивание, порядок,
   * дублирование и удаление с подтверждением.
   */
  function repeater(config) {
    const get = reader(config);
    const set = writer(config);

    const container = h("div", { class: "repeater" });
    const openState = new Set();

    function commit(next) {
      set(next);
      render();
    }

    function render() {
      Admin.UI.clear(container);
      const items = get() || [];

      if (!items.length) {
        container.appendChild(
          h("p", { class: "repeater__empty", text: config.emptyText || "Записей пока нет" })
        );
      }

      items.forEach((item, index) => {
        const key = item.id || `index-${index}`;
        const isOpen = openState.has(key);

        const body = h("div", { class: "repeater__body" });
        if (isOpen) {
          Admin.UI.append(
            body,
            config.renderItem(item, index, {
              update(patch) {
                const next = [...(get() || [])];
                next[index] = { ...next[index], ...patch };
                set(next);
                if (config.liveTitle !== false) refreshTitle(index);
              },
              refresh: render,
            })
          );
        }

        const titleText = config.itemTitle
          ? config.itemTitle(item, index)
          : item.title || `Запись ${index + 1}`;

        const wrapper = h(
          "article",
          { class: `repeater__item${isOpen ? " is-open" : ""}`, dataset: { key } },
          [
            h("div", { class: "repeater__head" }, [
              h(
                "button",
                {
                  class: "repeater__toggle",
                  type: "button",
                  "aria-expanded": String(isOpen),
                  onClick: () => {
                    if (openState.has(key)) openState.delete(key);
                    else openState.add(key);
                    render();
                  },
                },
                [
                  h("span", { class: "repeater__toggle-caret", text: "›", "aria-hidden": "true" }),
                  h("span", { class: "repeater__toggle-text", text: titleText }),
                  config.itemBadge ? config.itemBadge(item) : null,
                ]
              ),
              h("div", { class: "repeater__tools" }, [
                h("button", {
                  class: "repeater__tool",
                  type: "button",
                  title: "Поднять выше",
                  "aria-label": "Поднять выше",
                  text: "↑",
                  disabled: index === 0,
                  onClick: () => {
                    const next = [...(get() || [])];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    commit(next);
                  },
                }),
                h("button", {
                  class: "repeater__tool",
                  type: "button",
                  title: "Опустить ниже",
                  "aria-label": "Опустить ниже",
                  text: "↓",
                  disabled: index === items.length - 1,
                  onClick: () => {
                    const next = [...(get() || [])];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    commit(next);
                  },
                }),
                config.allowDuplicate === false
                  ? null
                  : h("button", {
                      class: "repeater__tool",
                      type: "button",
                      title: "Дублировать",
                      "aria-label": "Дублировать",
                      text: "⧉",
                      onClick: () => {
                        const next = [...(get() || [])];
                        const copy = Admin.Schema.clone(next[index]);
                        if (copy.id) copy.id = Admin.Schema.uid(String(copy.id).split("-")[0]);
                        // Помечаем копию по тому полю, которое служит заголовком записи.
                        const labelField = ["title", "name", "question"].find(
                          (field) => copy[field]
                        );
                        if (labelField) copy[labelField] = `${copy[labelField]} (копия)`;
                        if (copy.status === "published") copy.status = "draft";
                        // Копия встроенной записи — обычная пользовательская.
                        delete copy.builtin;
                        next.splice(index + 1, 0, copy);
                        commit(next);
                      },
                    }),
                h("button", {
                  class: "repeater__tool repeater__tool--danger",
                  type: "button",
                  title: "Удалить",
                  "aria-label": "Удалить",
                  text: "✕",
                  onClick: async () => {
                    const confirmed = await Admin.UI.confirm({
                      title: "Удалить запись?",
                      text: `«${titleText}» будет удалена без возможности отмены.`,
                      confirmLabel: "Удалить",
                      danger: true,
                    });
                    if (!confirmed) return;
                    const next = [...(get() || [])];
                    next.splice(index, 1);
                    commit(next);
                    Admin.UI.toast("Запись удалена");
                  },
                }),
              ]),
            ]),
            isOpen ? body : null,
          ]
        );

        container.appendChild(wrapper);
      });

      container.appendChild(
        h("button", {
          class: "btn btn--secondary btn--sm mt-2",
          type: "button",
          text: config.addLabel || "Добавить запись",
          onClick: () => {
            const item = config.blank();
            const next = [...(get() || []), item];
            openState.add(item.id || `index-${next.length - 1}`);
            commit(next);
          },
        })
      );
    }

    function refreshTitle(index) {
      const items = get() || [];
      const item = items[index];
      if (!item) return;
      const key = item.id || `index-${index}`;
      const node = container.querySelector(`[data-key="${CSS.escape(key)}"] .repeater__toggle-text`);
      if (node) {
        node.textContent = config.itemTitle
          ? config.itemTitle(item, index)
          : item.title || `Запись ${index + 1}`;
      }
    }

    render();

    return config.label ? wrap(config, container) : container;
  }

  return { text, url, textarea, select, checkbox, stringList, repeater, row, wrap };
})();
