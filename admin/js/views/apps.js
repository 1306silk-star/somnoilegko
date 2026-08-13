/**
 * Раздел «Приложения» — подключение внешних сервисов экосистемы «Сомной_легко».
 *
 * Первым подключено уже существующее приложение https://time.somnoilegko.ru.
 * Панель его не воспроизводит и не дублирует: она только безопасно открывает
 * приложение внутри изолированного окна или в новой вкладке.
 */

(function registerApps() {
  "use strict";

  const { h, card, callout, badge } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  function data() {
    return Store.getModule("apps");
  }

  function list() {
    return data().apps || [];
  }

  function findApp(id) {
    return list().find((app) => app.id === id) || null;
  }

  function initials(app) {
    if (app.icon) return app.icon;
    return String(app.name || "?")
      .trim()
      .slice(0, 2);
  }

  /* ───────────────────── Встроенное окно приложения ───────────────────── */

  function embedded(app) {
    const frame = h("iframe", {
      src: app.url,
      title: app.name,
      loading: "lazy",
      referrerpolicy: "no-referrer",
      sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads",
      allow: "clipboard-write",
    });

    const fallback = h(
      "div",
      {
        class: "empty",
        style: { position: "absolute", inset: "2.25rem 0 0", display: "none" },
      },
      [
        h("p", { class: "empty__title", text: "Приложение не открылось во встроенном окне" }),
        h("p", {
          class: "empty__text",
          text:
            "Сервис может запрещать встраивание в другие страницы — это его настройка безопасности. " +
            "Откройте приложение в новой вкладке.",
        }),
        h("a", {
          class: "btn btn--primary btn--sm",
          href: app.url,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "Открыть в новой вкладке",
        }),
      ]
    );

    let loaded = false;
    frame.addEventListener("load", () => {
      loaded = true;
    });
    window.setTimeout(() => {
      if (!loaded) fallback.style.display = "block";
    }, 6000);

    return h("div", { class: "stack" }, [
      h("div", { class: "inline" }, [
        h("a", { class: "btn btn--ghost btn--sm", href: "#/apps", text: "← Все приложения" }),
        h("a", {
          class: "btn btn--secondary btn--sm",
          href: app.url,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "Открыть в новой вкладке",
        }),
      ]),
      h("div", { class: "app-frame app-frame--framed", style: { position: "relative" } }, [
        h("div", { class: "app-frame__bar" }, [
          h("span", { class: "app-frame__dot" }),
          h("span", { class: "app-frame__dot" }),
          h("span", { class: "app-frame__dot" }),
          h("span", { text: app.url }),
        ]),
        frame,
        fallback,
      ]),
      h("p", {
        class: "text-sm muted",
        text:
          "Приложение работает на своём домене и открывается во встроенном окне. " +
          "Если окно осталось пустым — сервис запрещает встраивание, откройте его в новой вкладке.",
      }),
    ]);
  }

  /* ───────────────────── Список приложений ───────────────────── */

  function overview() {
    const cards = list().length
      ? h(
          "div",
          { class: "grid grid--2" },
          list().map((app) =>
            h("article", { class: "app-card" }, [
              h("div", { class: "app-card__top" }, [
                h("span", { class: "app-card__mark", text: initials(app) }),
                h("div", {}, [
                  h("h3", { class: "app-card__name", text: app.name }),
                  h("p", { class: "app-card__url", text: app.url || "адрес не указан" }),
                ]),
              ]),
              h("p", { class: "app-card__text", text: app.description }),
              h("div", { class: "inline" }, [
                badge(app.status === "active" ? "active" : "disabled"),
                app.builtin
                  ? h("span", { class: "badge badge--muted", text: "Внешнее приложение" })
                  : null,
              ]),
              h("div", { class: "btn-row" }, [
                app.embed && app.url
                  ? h("a", {
                      class: "btn btn--primary btn--sm",
                      href: `#/apps/open/${app.id}`,
                      text: "Открыть в панели",
                    })
                  : null,
                app.url
                  ? h("a", {
                      class: "btn btn--secondary btn--sm",
                      href: app.url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      text: "Открыть отдельно",
                    })
                  : null,
              ]),
            ])
          )
        )
      : Admin.UI.empty(
          "Приложений пока нет",
          "Подключите первое приложение — достаточно указать название и адрес."
        );

    return h("div", { class: "stack" }, [
      callout("info", [
        h("strong", { text: "Подключение, а не копирование. " }),
        "Приложения остаются самостоятельными сервисами на своих адресах. Панель хранит ",
        "только ссылку и открывает их в изолированном окне: доступа к данным панели у них нет.",
      ]),
      card({ title: "Подключённые приложения", body: cards }),
      card({
        title: "Настройка подключений",
        subtitle: "Добавление, изменение и отключение",
        body: F.repeater({
          get: () => list(),
          set: (value) => {
            data().apps = value;
            Store.saveModuleSoon("apps");
          },
          blank: Admin.Schema.blanks.app,
          addLabel: "Подключить приложение",
          emptyText: "Список пуст",
          itemTitle: (app) => app.name || "Без названия",
          itemBadge: (app) => badge(app.status === "active" ? "active" : "disabled"),
          renderItem: (app, index, api) => [
            F.row("2", [
              F.text({
                label: "Название",
                get: () => app.name,
                set: (value) => api.update({ name: value }),
              }),
              F.text({
                label: "Короткий значок",
                hint: "Одна или две буквы для плитки",
                get: () => app.icon,
                set: (value) => api.update({ icon: value.slice(0, 2) }),
              }),
            ]),
            F.url({
              label: "Адрес приложения",
              get: () => app.url,
              set: (value) => api.update({ url: value.trim() }),
            }),
            F.textarea({
              label: "Описание",
              rows: 3,
              get: () => app.description,
              set: (value) => api.update({ description: value }),
            }),
            F.select({
              label: "Состояние",
              options: [
                { value: "active", label: "Подключено" },
                { value: "disabled", label: "Отключено" },
              ],
              get: () => app.status,
              set: (value) => {
                api.update({ status: value });
                api.refresh();
              },
            }),
            F.checkbox({
              label: "Разрешить открывать внутри панели",
              get: () => app.embed,
              set: (value) => api.update({ embed: value }),
            }),
          ],
        }),
      }),
    ]);
  }

  function render(params) {
    const [section, id] = params || [];

    if (section === "open" && id) {
      const app = findApp(id);
      if (!app || !app.url) {
        return Admin.UI.empty(
          "Приложение не найдено",
          "Проверьте список подключённых приложений.",
          h("a", { class: "btn btn--primary btn--sm", href: "#/apps", text: "К списку" })
        );
      }
      return embedded(app);
    }

    return overview();
  }

  Admin.Router.register({
    id: "apps",
    title: "Приложения",
    eyebrow: "Экосистема",
    nav: "Приложения",
    group: "Бренд",
    render,
  });
})();
