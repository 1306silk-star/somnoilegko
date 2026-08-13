/**
 * Раздел «Telegram» — редактор публикаций, отложенная отправка и библиотека.
 *
 * Отправка выполняется одним из двух способов:
 *   • через сервер панели — токен бота хранится на сервере и не попадает в браузер
 *     (рекомендуемый способ, работает вместе с планировщиком);
 *   • напрямую из браузера — быстрый способ проверить связку без сервера,
 *     но токен при этом лежит в localStorage. Подходит только для личного компьютера.
 *
 * Пока токен не указан, интерфейс работает полностью: посты создаются, сохраняются
 * и планируются. Отправка при этом честно сообщает, чего не хватает.
 */

(function registerTelegram() {
  "use strict";

  const { h, card, badge, callout, formatDate, toLocalInput, fromLocalInput } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  const TEXT_LIMIT = 4096;
  const CAPTION_LIMIT = 1024;

  const FILTERS = [
    { id: "all", label: "Все" },
    { id: "draft", label: "Черновики" },
    { id: "scheduled", label: "Запланированные" },
    { id: "sent", label: "Опубликованные" },
    { id: "error", label: "С ошибкой" },
  ];

  let activeFilter = "all";
  let schedulerTimer = 0;

  /* ───────────────────── Данные ───────────────────── */

  function data() {
    return Store.getModule("telegram");
  }

  function posts() {
    return data().posts || [];
  }

  function findPost(id) {
    return posts().find((post) => post.id === id) || null;
  }

  async function persist() {
    await Store.saveModule("telegram");
  }

  function isConfigured() {
    const settings = data().settings;
    if (settings.transport === "server") {
      return Store.state.mode === "server" && Boolean(settings.chatId);
    }
    return Boolean(settings.botToken && settings.chatId);
  }

  function missingReason() {
    const settings = data().settings;
    if (settings.transport === "server" && Store.state.mode !== "server") {
      return "Выбрана отправка через сервер, но сервер панели не запущен.";
    }
    if (settings.transport === "direct" && !settings.botToken) {
      return "Не указан токен бота.";
    }
    if (!settings.chatId) {
      return "Не указан канал или чат для публикации.";
    }
    return "";
  }

  /* ───────────────────── Отправка ───────────────────── */

  async function sendPost(post) {
    const settings = data().settings;

    if (settings.transport === "server") {
      const result = await Admin.Api.post("/telegram/send", {
        text: post.text,
        imageUrl: post.imageUrl,
        chatId: settings.chatId,
        parseMode: settings.parseMode,
        disablePreview: !post.linkPreview,
        silent: post.silent,
      });
      return result;
    }

    const base = `https://api.telegram.org/bot${settings.botToken}`;
    const usePhoto = Boolean(post.imageUrl);
    const endpoint = usePhoto ? "sendPhoto" : "sendMessage";

    const payload = usePhoto
      ? {
          chat_id: settings.chatId,
          photo: post.imageUrl,
          caption: post.text,
          parse_mode: settings.parseMode,
          disable_notification: Boolean(post.silent),
        }
      : {
          chat_id: settings.chatId,
          text: post.text,
          parse_mode: settings.parseMode,
          disable_web_page_preview: !post.linkPreview,
          disable_notification: Boolean(post.silent),
        };

    const response = await fetch(`${base}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.description || "Telegram отклонил запрос");
    }
    return { messageId: result.result && result.result.message_id };
  }

  async function publishPost(post) {
    if (!String(post.text || "").trim()) {
      Admin.UI.toast("Нельзя опубликовать пустой пост", "error");
      return false;
    }
    if (!isConfigured()) {
      Admin.UI.toast(missingReason() || "Telegram не настроен", "warn", 6000);
      return false;
    }

    try {
      const result = await sendPost(post);
      post.status = "sent";
      post.publishedAt = new Date().toISOString();
      post.messageId = (result && result.messageId) || null;
      post.error = "";
      post.updatedAt = new Date().toISOString();
      await persist();
      Admin.UI.toast("Публикация отправлена в Telegram");
      return true;
    } catch (error) {
      post.status = "error";
      post.error = error.message || String(error);
      post.updatedAt = new Date().toISOString();
      await persist();
      Admin.UI.toast(`Не удалось отправить: ${post.error}`, "error", 7000);
      return false;
    }
  }

  /* ───────────────────── Планировщик ───────────────────── */

  /**
   * Локальный планировщик: пока панель открыта, каждую минуту проверяет,
   * не подошло ли время отложенных публикаций. В серверном режиме ту же
   * работу независимо делает сервер, поэтому панель не обязана быть открытой.
   */
  async function runScheduler() {
    if (Store.state.mode === "server") return;

    const now = Date.now();
    const due = posts().filter(
      (post) =>
        post.status === "scheduled" &&
        post.scheduledAt &&
        new Date(post.scheduledAt).getTime() <= now
    );

    if (!due.length || !isConfigured()) return;

    for (const post of due) {
      // eslint-disable-next-line no-await-in-loop
      await publishPost(post);
    }
    if (Admin.Router.current && Admin.Router.current.id === "telegram") Admin.App.refresh();
  }

  function startScheduler() {
    window.clearInterval(schedulerTimer);
    schedulerTimer = window.setInterval(runScheduler, 60000);
    runScheduler();
  }

  /* ───────────────────── Редактор поста ───────────────────── */

  function editor(post, isNew) {
    const preview = h("div", { class: "tg-preview" });
    const counter = h("span", { class: "tg-counter" });

    function refreshPreview() {
      const limit = post.imageUrl ? CAPTION_LIMIT : TEXT_LIMIT;
      const length = String(post.text || "").length;
      counter.textContent = `${length} / ${limit}`;
      counter.classList.toggle("is-over", length > limit);

      Admin.UI.clear(preview);
      const parts = [];

      if (post.imageUrl) {
        parts.push(
          h(
            "div",
            { class: "tg-preview__image" },
            h("img", {
              src: post.imageUrl,
              alt: "Изображение публикации",
              onError: (event) => {
                event.target.style.display = "none";
              },
            })
          )
        );
      }

      parts.push(h("div", { class: "tg-preview__bubble", text: post.text || "" }));
      parts.push(
        h("p", {
          class: "tg-preview__meta",
          text:
            post.status === "scheduled" && post.scheduledAt
              ? `Отправка ${formatDate(post.scheduledAt)}`
              : post.status === "sent"
              ? `Опубликовано ${formatDate(post.publishedAt)}`
              : "Черновик",
        })
      );

      Admin.UI.append(preview, parts);
    }

    function update(patch) {
      Object.assign(post, patch, { updatedAt: new Date().toISOString() });
      refreshPreview();
    }

    async function save(nextStatus) {
      if (nextStatus) post.status = nextStatus;

      if (post.status === "scheduled" && !post.scheduledAt) {
        Admin.UI.toast("Укажите дату и время отправки", "warn");
        return;
      }

      if (isNew && !posts().some((item) => item.id === post.id)) {
        data().posts = [post, ...posts()];
      }

      await persist();
      Admin.UI.toast(
        post.status === "scheduled" ? "Публикация запланирована" : "Черновик сохранён"
      );
      Admin.Router.navigate("telegram");
    }

    refreshPreview();

    const scheduleField = F.text({
      label: "Дата и время отправки",
      type: "datetime-local",
      hint: "Время указывается в часовом поясе вашего устройства",
      get: () => toLocalInput(post.scheduledAt),
      set: (value) => update({ scheduledAt: fromLocalInput(value) }),
    });
    scheduleField.hidden = post.status !== "scheduled";

    const statusField = F.select({
      label: "Статус",
      options: [
        { value: "draft", label: "Черновик" },
        { value: "scheduled", label: "Запланировано" },
      ],
      get: () => (post.status === "sent" ? "draft" : post.status),
      set: (value) => {
        update({ status: value });
        scheduleField.hidden = value !== "scheduled";
      },
    });

    const actions = h("div", { class: "btn-row mt-4" }, [
      h("button", {
        class: "btn btn--secondary",
        type: "button",
        text: "Сохранить черновик",
        onClick: () => save(post.status === "scheduled" ? "scheduled" : "draft"),
      }),
      h("button", {
        class: "btn btn--primary",
        type: "button",
        text: "Опубликовать сейчас",
        onClick: async () => {
          if (isNew && !posts().some((item) => item.id === post.id)) {
            data().posts = [post, ...posts()];
          }
          const done = await publishPost(post);
          if (done) Admin.Router.navigate("telegram");
          else await persist();
        },
      }),
      h("button", {
        class: "btn btn--ghost",
        type: "button",
        text: "Отмена",
        onClick: () => Admin.Router.navigate("telegram"),
      }),
    ]);

    const form = h("div", { class: "stack" }, [
      isConfigured()
        ? null
        : callout("warn", [
            h("strong", { text: "Отправка пока недоступна. " }),
            missingReason(),
            " Публикации можно создавать и планировать — они отправятся, как только вы ",
            h("a", { href: "#/telegram/settings", text: "подключите бота" }),
            ".",
          ]),
      card({
        title: isNew ? "Новая публикация" : "Редактирование публикации",
        body: [
          F.text({
            label: "Внутреннее название",
            hint: "Видно только в панели, помогает искать пост в библиотеке",
            get: () => post.title,
            set: (value) => update({ title: value }),
          }),
          F.textarea({
            label: "Текст публикации",
            tall: true,
            get: () => post.text,
            set: (value) => update({ text: value }),
          }),
          h("div", { class: "inline" }, [
            counter,
            h("span", {
              class: "text-xs muted",
              text: `Режим разметки: ${data().settings.parseMode || "без разметки"}`,
            }),
          ]),
          F.url({
            label: "Изображение",
            hint: "Прямая ссылка на картинку. С изображением лимит текста — 1024 символа.",
            className: "mt-4",
            get: () => post.imageUrl,
            set: (value) => update({ imageUrl: value }),
          }),
          h("div", { class: "stack mt-4" }, [
            F.checkbox({
              label: "Показывать превью ссылок",
              get: () => post.linkPreview,
              set: (value) => update({ linkPreview: value }),
            }),
            F.checkbox({
              label: "Отправить без звука",
              get: () => post.silent,
              set: (value) => update({ silent: value }),
            }),
          ]),
        ],
      }),
      card({
        title: "Публикация",
        body: [statusField, scheduleField, actions],
      }),
    ]);

    return h("div", { class: "tg-compose" }, [
      form,
      h("div", { class: "stack" }, [
        h("p", { class: "field__label", text: "Предпросмотр" }),
        preview,
      ]),
    ]);
  }

  /* ───────────────────── Библиотека ───────────────────── */

  function library() {
    const all = posts();
    const filtered =
      activeFilter === "all" ? all : all.filter((post) => post.status === activeFilter);

    const sorted = [...filtered].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    const filterBar = h(
      "div",
      { class: "tabs" },
      FILTERS.map((filter) => {
        const count =
          filter.id === "all"
            ? all.length
            : all.filter((post) => post.status === filter.id).length;
        return h("button", {
          class: `tab${activeFilter === filter.id ? " is-active" : ""}`,
          type: "button",
          text: `${filter.label} (${count})`,
          onClick: () => {
            activeFilter = filter.id;
            Admin.App.refresh();
          },
        });
      })
    );

    const list = sorted.length
      ? h(
          "div",
          {},
          sorted.map((post) =>
            h("article", { class: "record" }, [
              h("div", { class: "record__main" }, [
                h("p", {
                  class: "record__title",
                  text: post.title || String(post.text || "").slice(0, 70) || "Без названия",
                }),
                h("div", { class: "record__meta" }, [
                  badge(post.status),
                  h("span", {
                    text:
                      post.status === "scheduled"
                        ? `Отправка ${formatDate(post.scheduledAt)}`
                        : post.status === "sent"
                        ? `Опубликовано ${formatDate(post.publishedAt)}`
                        : `Изменён ${formatDate(post.updatedAt)}`,
                  }),
                ]),
                post.error
                  ? h("p", { class: "record__excerpt", text: `Ошибка: ${post.error}` })
                  : h("p", { class: "record__excerpt", text: post.text || "" }),
              ]),
              h("div", { class: "record__actions" }, [
                h("a", {
                  class: "btn btn--ghost btn--sm",
                  href: `#/telegram/edit/${post.id}`,
                  text: post.status === "sent" ? "Открыть" : "Редактировать",
                }),
                post.status !== "sent"
                  ? h("button", {
                      class: "btn btn--secondary btn--sm",
                      type: "button",
                      text: "Опубликовать",
                      onClick: async () => {
                        await publishPost(post);
                        Admin.App.refresh();
                      },
                    })
                  : null,
                h("button", {
                  class: "btn btn--ghost btn--sm",
                  type: "button",
                  text: "Дублировать",
                  onClick: async () => {
                    const copy = Admin.Schema.clone(post);
                    copy.id = Admin.Schema.uid("post");
                    copy.status = "draft";
                    copy.publishedAt = "";
                    copy.messageId = null;
                    copy.error = "";
                    copy.title = `${copy.title || "Публикация"} (копия)`;
                    copy.createdAt = new Date().toISOString();
                    copy.updatedAt = copy.createdAt;
                    data().posts = [copy, ...posts()];
                    await persist();
                    Admin.UI.toast("Копия создана");
                    Admin.App.refresh();
                  },
                }),
                h("button", {
                  class: "btn btn--danger btn--sm",
                  type: "button",
                  text: "Удалить",
                  onClick: async () => {
                    const confirmed = await Admin.UI.confirm({
                      title: "Удалить публикацию?",
                      text: "Запись будет удалена из библиотеки. Отменить это нельзя.",
                      confirmLabel: "Удалить",
                      danger: true,
                    });
                    if (!confirmed) return;
                    data().posts = posts().filter((item) => item.id !== post.id);
                    await persist();
                    Admin.UI.toast("Публикация удалена");
                    Admin.App.refresh();
                  },
                }),
              ]),
            ])
          )
        )
      : Admin.UI.empty(
          "Публикаций пока нет",
          "Создайте первую публикацию — её можно сохранить как черновик, запланировать или отправить сразу.",
          h("a", { class: "btn btn--primary btn--sm", href: "#/telegram/new", text: "Написать пост" })
        );

    return h("div", { class: "stack" }, [
      isConfigured()
        ? null
        : callout("warn", [
            h("strong", { text: "Бот не подключён. " }),
            missingReason(),
            " ",
            h("a", { href: "#/telegram/settings", text: "Открыть настройки Telegram" }),
          ]),
      card({
        title: "Библиотека публикаций",
        subtitle: "Черновики, отложенные и уже отправленные посты",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "#/telegram/settings",
            text: "Настройки",
          }),
          h("a", { class: "btn btn--primary btn--sm", href: "#/telegram/new", text: "Написать пост" }),
        ],
        body: [filterBar, list],
      }),
    ]);
  }

  /* ───────────────────── Настройки ───────────────────── */

  function settings() {
    const config = data().settings;
    const serverAvailable = Store.state.mode === "server";

    const tokenField = F.text({
      label: "Токен бота",
      type: "password",
      hint: "Выдаётся ботом @BotFather. Хранится только в этом браузере.",
      get: () => config.botToken,
      set: (value) => {
        config.botToken = value.trim();
      },
    });

    function syncTokenVisibility() {
      tokenField.hidden = config.transport === "server";
    }

    const transportField = F.select({
      label: "Способ отправки",
      options: [
        { value: "server", label: "Через сервер панели (рекомендуется)" },
        { value: "direct", label: "Напрямую из браузера" },
      ],
      hint: serverAvailable
        ? "Сервер найден: токен можно хранить только на сервере."
        : "Сервер панели не запущен — доступна только отправка напрямую из браузера.",
      get: () => config.transport,
      set: (value) => {
        config.transport = value;
        syncTokenVisibility();
      },
    });

    syncTokenVisibility();

    return h("div", { class: "stack" }, [
      callout("info", [
        h("strong", { text: "Куда вставить данные доступа. " }),
        "Создайте бота у ",
        h("code", { text: "@BotFather" }),
        ", добавьте его администратором в канал и укажите ниже адрес канала. ",
        "При работе через сервер токен вписывается в ",
        h("code", { text: "server/config.json" }),
        " — в браузер он не попадает.",
      ]),
      card({
        title: "Подключение",
        body: [
          transportField,
          tokenField,
          F.text({
            label: "Канал или чат",
            hint: "Публичный канал указывается как @somnoi_legko, приватный — числовым ID",
            get: () => config.chatId,
            set: (value) => {
              config.chatId = value.trim();
            },
          }),
          F.url({
            label: "Публичный адрес канала",
            hint: "Используется в ссылках панели",
            get: () => config.channelUrl,
            set: (value) => {
              config.channelUrl = value.trim();
            },
          }),
          F.select({
            label: "Разметка текста",
            options: [
              { value: "HTML", label: "HTML" },
              { value: "MarkdownV2", label: "MarkdownV2" },
              { value: "", label: "Без разметки" },
            ],
            get: () => config.parseMode,
            set: (value) => {
              config.parseMode = value;
            },
          }),
          h("div", { class: "btn-row mt-4" }, [
            h("button", {
              class: "btn btn--primary",
              type: "button",
              text: "Сохранить настройки",
              onClick: async () => {
                await persist();
                Admin.UI.toast("Настройки Telegram сохранены");
                Admin.App.refresh();
              },
            }),
            h("button", {
              class: "btn btn--secondary",
              type: "button",
              text: "Проверить связь",
              onClick: async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                button.textContent = "Проверяем…";
                try {
                  await persist();
                  if (config.transport === "server") {
                    const result = await Admin.Api.post("/telegram/verify", {});
                    Admin.UI.toast(
                      result.username
                        ? `Бот подключён: @${result.username}`
                        : "Сервер принял настройки"
                    );
                  } else {
                    if (!config.botToken) throw new Error("Сначала укажите токен бота");
                    const response = await fetch(
                      `https://api.telegram.org/bot${config.botToken}/getMe`
                    );
                    const result = await response.json();
                    if (!result.ok) throw new Error(result.description || "Токен не принят");
                    Admin.UI.toast(`Бот подключён: @${result.result.username}`);
                  }
                } catch (error) {
                  Admin.UI.toast(error.message || String(error), "error", 6000);
                } finally {
                  button.disabled = false;
                  button.textContent = "Проверить связь";
                }
              },
            }),
            h("a", { class: "btn btn--ghost", href: "#/telegram", text: "К публикациям" }),
          ]),
        ],
      }),
      card({
        modifier: "card--flat",
        title: "Как работает отложенная публикация",
        body: h("div", { class: "stack text-sm muted" }, [
          h("p", {
            text:
              "Через сервер: планировщик работает постоянно и отправляет пост в назначенное время, " +
              "даже если панель закрыта.",
          }),
          h("p", {
            text:
              "Напрямую из браузера: панель проверяет расписание раз в минуту, пока страница открыта. " +
              "Если закрыть вкладку, пост уйдёт при следующем открытии панели.",
          }),
        ]),
      }),
    ]);
  }

  /* ───────────────────── Точка входа раздела ───────────────────── */

  function render(params) {
    const [section, id] = params || [];

    if (section === "settings") return settings();

    if (section === "new") {
      return editor(Admin.Schema.blanks.telegramPost(), true);
    }

    if (section === "edit" && id) {
      const post = findPost(id);
      if (!post) {
        return Admin.UI.empty(
          "Публикация не найдена",
          "Возможно, она была удалена.",
          h("a", { class: "btn btn--primary btn--sm", href: "#/telegram", text: "К библиотеке" })
        );
      }
      return editor(post, false);
    }

    return library();
  }

  Admin.Router.register({
    id: "telegram",
    title: "Telegram",
    eyebrow: "Каналы",
    nav: "Telegram",
    group: "Каналы",
    render,
    onEnter: startScheduler,
  });

  document.addEventListener("admin:ready", startScheduler);
})();
