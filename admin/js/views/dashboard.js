/**
 * Раздел «Обзор» — состояние сайта, метрики и быстрые действия.
 */

(function registerDashboard() {
  "use strict";

  const { h, card, badge, callout, formatDate, relativeTime } = Admin.UI;
  const Store = Admin.Store;

  function countByStatus(items, status) {
    return (items || []).filter((item) => (item.status || "published") === status).length;
  }

  function metric(label, value, hint) {
    return h("article", { class: "metric" }, [
      h("p", { class: "metric__label", text: label }),
      h("p", { class: "metric__value", text: String(value) }),
      hint ? h("p", { class: "metric__hint", text: hint }) : null,
    ]);
  }

  function quickLink(title, text, target) {
    return h(
      "a",
      { class: "record", href: `#/${target}` },
      h("div", { class: "record__main" }, [
        h("p", { class: "record__title", text: title }),
        h("p", { class: "record__excerpt", text }),
      ])
    );
  }

  function render() {
    const content = Store.getContent();
    const telegram = Store.getModule("telegram");
    const brandOs = Store.getModule("brandOs");
    const apps = Store.getModule("apps");
    const ai = Store.getModule("ai");

    const projects = (content.projects && content.projects.items) || [];
    const cases = (content.cases && content.cases.items) || [];
    const faq = (content.faq && content.faq.items) || [];
    const testimonials = (content.testimonials && content.testimonials.items) || [];
    const posts = telegram.posts || [];

    const root = h("div", { class: "stack" });

    /* ── Предупреждения ── */

    if (Admin.Auth.usesDefaultPassword) {
      root.appendChild(
        callout("danger", [
          h("strong", { text: "Смените пароль администратора. " }),
          "Сейчас используется пароль по умолчанию — панель доступна любому, кто знает его. ",
          h("a", { href: "#/settings", text: "Перейти в настройки" }),
        ])
      );
    }

    if (Store.state.mode === "local") {
      root.appendChild(
        callout("info", [
          h("strong", { text: "Локальный режим. " }),
          "Сервер панели не запущен, поэтому изменения сохраняются в этом браузере. ",
          "Чтобы правки увидели посетители сайта, опубликуйте их и обновите файл ",
          h("code", { text: "data/content.js" }),
          " — кнопка выгрузки есть в настройках. ",
          h("a", { href: "#/settings", text: "Как включить серверный режим" }),
        ])
      );
    }

    /* ── Состояние публикации ── */

    root.appendChild(
      card({
        modifier: "card--accent",
        title: "Состояние сайта",
        subtitle: Store.state.dirty
          ? "Есть несохранённые изменения — они видны только в предпросмотре"
          : "Черновик совпадает с опубликованной версией",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "../index.html?cms-preview=1",
            target: "_blank",
            rel: "noopener",
            text: "Открыть предпросмотр",
          }),
          h("button", {
            class: "btn btn--primary btn--sm",
            type: "button",
            text: "Опубликовать",
            onClick: () => document.getElementById("publish-button").click(),
          }),
        ],
        body: h("div", { class: "inline" }, [
          badge(Store.state.dirty ? "draft" : "published"),
          h("span", {
            class: "text-sm muted",
            text: `Последняя публикация: ${formatDate(
              content.updatedAt || Store.state.published.updatedAt
            )}`,
          }),
          Store.state.lastSavedAt
            ? h("span", {
                class: "text-sm muted",
                text: `· Черновик сохранён ${relativeTime(Store.state.lastSavedAt)}`,
              })
            : null,
        ]),
      })
    );

    /* ── Метрики ── */

    root.appendChild(
      h("div", { class: "grid grid--4" }, [
        metric(
          "Проекты",
          countByStatus(projects, "published"),
          `${countByStatus(projects, "draft")} в черновиках`
        ),
        metric(
          "Кейсы",
          countByStatus(cases, "published"),
          `${countByStatus(cases, "draft")} в черновиках`
        ),
        metric("Вопросы FAQ", countByStatus(faq, "published"), `всего ${faq.length}`),
        metric(
          "Отзывы",
          countByStatus(testimonials, "published"),
          testimonials.length ? `всего ${testimonials.length}` : "секция скрыта на сайте"
        ),
      ])
    );

    root.appendChild(
      h("div", { class: "grid grid--4" }, [
        metric(
          "Публикации Telegram",
          posts.length,
          `${countByStatus(posts, "draft")} черновиков · ${countByStatus(
            posts,
            "scheduled"
          )} запланировано`
        ),
        metric("Документы бренда", (brandOs.docs || []).length, "Brand OS"),
        metric(
          "AI-инструменты",
          (ai.tools || []).filter((tool) => tool.enabled).length,
          `всего ${(ai.tools || []).length}`
        ),
        metric(
          "Приложения",
          (apps.apps || []).filter((app) => app.status === "active").length,
          "подключено к экосистеме"
        ),
      ])
    );

    /* ── Ближайшие публикации ── */

    const scheduled = posts
      .filter((post) => post.status === "scheduled" && post.scheduledAt)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      .slice(0, 4);

    root.appendChild(
      card({
        title: "Ближайшие публикации",
        subtitle: "Запланированные посты в Telegram",
        actions: [
          h("a", { class: "btn btn--ghost btn--sm", href: "#/telegram", text: "Все публикации" }),
        ],
        body: scheduled.length
          ? h(
              "div",
              {},
              scheduled.map((post) =>
                h("div", { class: "record" }, [
                  h("div", { class: "record__main" }, [
                    h("p", {
                      class: "record__title",
                      text: post.title || post.text.slice(0, 60) || "Без названия",
                    }),
                    h("p", { class: "record__meta" }, [
                      badge("scheduled"),
                      h("span", { text: formatDate(post.scheduledAt) }),
                    ]),
                  ]),
                  h("div", { class: "record__actions" }, [
                    h("a", {
                      class: "btn btn--ghost btn--sm",
                      href: `#/telegram/edit/${post.id}`,
                      text: "Открыть",
                    }),
                  ]),
                ])
              )
            )
          : h("p", {
              class: "text-sm muted",
              text: "Запланированных публикаций нет. Создайте пост и укажите дату отправки.",
            }),
      })
    );

    /* ── Быстрые переходы ── */

    root.appendChild(
      card({
        title: "Быстрые действия",
        body: h("div", { class: "stack" }, [
          quickLink(
            "Изменить первый экран",
            "Заголовок, подзаголовок, кнопки и фотография Hero",
            "content"
          ),
          quickLink("Добавить проект", "Карточки в разделе «Инструменты» на сайте", "projects"),
          quickLink("Написать пост", "Черновик, отложенная или мгновенная публикация", "telegram"),
          quickLink("Открыть Brand OS", "Документы бренда: смысл, тон, визуальный язык", "brand-os"),
        ]),
      })
    );

    return root;
  }

  Admin.Router.register({
    id: "dashboard",
    title: "Обзор",
    eyebrow: "Панель",
    nav: "Обзор",
    group: "Главное",
    icon: "grid",
    render,
  });
})();
