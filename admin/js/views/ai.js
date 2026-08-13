/**
 * Раздел «AI» — расширяемая архитектура для будущих инструментов.
 *
 * Инструмент — это описание задачи и шаблон запроса с подстановками {{...}}.
 * Выполнение вынесено в провайдеров (Admin.AI.providers): сейчас доступен
 * ручной режим (готовый запрос копируется в любой чат), а подключение
 * настоящего API добавляется одним новым провайдером без правки интерфейса.
 */

(function registerAi() {
  "use strict";

  const { h, card, callout } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  /* ───────────────────── Реестр провайдеров ───────────────────── */

  const providers = {
    manual: {
      id: "manual",
      label: "Ручной режим (без ключа)",
      needsKey: false,
      async run(prompt) {
        return {
          text: prompt,
          note:
            "Готовый запрос сформирован. Скопируйте его и вставьте в любой AI-чат — " +
            "ключи для этого не нужны.",
        };
      },
    },

    openaiCompatible: {
      id: "openaiCompatible",
      label: "OpenAI-совместимый API",
      needsKey: true,
      async run(prompt, settings) {
        const endpoint =
          settings.endpoint || "https://api.openai.com/v1/chat/completions";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model || "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            (result.error && result.error.message) || `Ошибка запроса ${response.status}`
          );
        }
        return { text: result.choices[0].message.content };
      },
    },
  };

  Admin.AI = { providers };

  const TARGETS = [
    { value: "manual", label: "Общий" },
    { value: "telegram", label: "Telegram" },
    { value: "seo", label: "SEO" },
    { value: "faq", label: "FAQ" },
    { value: "site", label: "Тексты сайта" },
  ];

  function data() {
    return Store.getModule("ai");
  }

  /* ───────────────────── Запуск инструмента ───────────────────── */

  function collectPlaceholders(prompt) {
    const found = new Set();
    String(prompt || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name) => {
      found.add(name.trim());
      return match;
    });
    return [...found];
  }

  function fillPrompt(prompt, values) {
    return String(prompt || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name) => {
      const value = values[name.trim()];
      return value === undefined ? match : value;
    });
  }

  function runTool(tool) {
    const settings = data().settings;
    const placeholders = collectPlaceholders(tool.prompt);
    const values = {};
    const output = h("div", { class: "ai-output", text: "Результат появится здесь." });

    const inputs = placeholders.map((name) =>
      F.text({
        label: name,
        placeholder: `Значение для «${name}»`,
        get: () => values[name] || "",
        set: (value) => {
          values[name] = value;
        },
      })
    );

    const close = Admin.UI.modal({
      wide: true,
      title: tool.name,
      body: h("div", { class: "stack" }, [
        h("p", { class: "text-sm muted", text: tool.description }),
        inputs.length
          ? h("div", {}, inputs)
          : h("p", { class: "text-sm muted", text: "Дополнительные данные не требуются." }),
        output,
      ]),
      actions: [
        h("button", {
          class: "btn btn--ghost",
          type: "button",
          text: "Скопировать результат",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(output.textContent);
              Admin.UI.toast("Скопировано");
            } catch (error) {
              Admin.UI.toast("Браузер не разрешил копирование", "warn");
            }
          },
        }),
        h("button", {
          class: "btn btn--primary",
          type: "button",
          text: "Выполнить",
          "data-autofocus": "",
          onClick: async (event) => {
            const button = event.currentTarget;
            const provider = providers[settings.provider] || providers.manual;

            if (provider.needsKey && !settings.apiKey) {
              Admin.UI.toast("Для этого провайдера нужен ключ доступа", "warn");
              return;
            }

            button.disabled = true;
            button.textContent = "Выполняем…";
            output.textContent = "Готовим ответ…";

            try {
              const prompt = fillPrompt(tool.prompt, values);
              const result = await provider.run(prompt, settings);
              output.textContent = result.text;
              if (result.note) Admin.UI.toast(result.note, null, 6000);

              data().history = [
                {
                  id: Admin.Schema.uid("run"),
                  toolId: tool.id,
                  toolName: tool.name,
                  at: new Date().toISOString(),
                  provider: provider.id,
                },
                ...(data().history || []),
              ].slice(0, 30);
              Store.saveModuleSoon("ai");
            } catch (error) {
              output.textContent = `Ошибка: ${error.message || error}`;
              Admin.UI.toast("Не удалось выполнить запрос", "error");
            } finally {
              button.disabled = false;
              button.textContent = "Выполнить";
            }
          },
        }),
        h("button", { class: "btn btn--ghost", type: "button", text: "Закрыть", onClick: () => close() }),
      ],
    });
  }

  /* ───────────────────── Раздел ───────────────────── */

  function render() {
    const settings = data().settings;
    const tools = data().tools || [];

    const providerOptions = [
      { value: "none", label: "Не выбран" },
      ...Object.values(providers).map((provider) => ({
        value: provider.id,
        label: provider.label,
      })),
    ];

    const toolCards = tools.length
      ? h(
          "div",
          { class: "grid grid--2" },
          tools.map((tool) =>
            h("article", { class: "ai-tool" }, [
              h("div", { class: "ai-tool__head" }, [
                h("h3", { class: "ai-tool__name", text: tool.name }),
                tool.enabled
                  ? h("span", { class: "badge badge--published", text: "Включён" })
                  : h("span", { class: "badge badge--muted", text: "Выключен" }),
              ]),
              h("p", { class: "ai-tool__text", text: tool.description }),
              h("div", { class: "btn-row" }, [
                h("button", {
                  class: "btn btn--primary btn--sm",
                  type: "button",
                  text: "Запустить",
                  disabled: !tool.enabled,
                  onClick: () => runTool(tool),
                }),
              ]),
            ])
          )
        )
      : Admin.UI.empty(
          "Инструментов пока нет",
          "Добавьте первый инструмент ниже — это шаблон запроса с подстановками."
        );

    return h("div", { class: "stack" }, [
      callout("info", [
        h("strong", { text: "Как это устроено. " }),
        "Инструмент — это шаблон запроса. Места для подстановки обозначаются как ",
        h("code", { text: "{{тема}}" }),
        ". Без ключа доступа инструмент работает в ручном режиме: панель собирает готовый ",
        "запрос, который можно вставить в любой AI-чат. Подключение настоящего API ",
        "добавляется новым провайдером и сразу становится доступно всем инструментам.",
      ]),
      card({
        title: "Подключение AI",
        subtitle: "Ключ хранится только в этом браузере",
        body: [
          F.select({
            label: "Провайдер",
            options: providerOptions,
            get: () => settings.provider,
            set: (value) => {
              settings.provider = value;
              Store.saveModuleSoon("ai");
            },
          }),
          F.row("2", [
            F.text({
              label: "Ключ доступа",
              type: "password",
              hint: "Оставьте пустым, чтобы работать в ручном режиме",
              get: () => settings.apiKey,
              set: (value) => {
                settings.apiKey = value.trim();
                Store.saveModuleSoon("ai");
              },
            }),
            F.text({
              label: "Модель",
              placeholder: "gpt-4o-mini",
              get: () => settings.model,
              set: (value) => {
                settings.model = value.trim();
                Store.saveModuleSoon("ai");
              },
            }),
          ]),
          F.url({
            label: "Адрес API",
            hint: "Только для совместимых сервисов. Пусто — стандартный адрес OpenAI.",
            get: () => settings.endpoint,
            set: (value) => {
              settings.endpoint = value.trim();
              Store.saveModuleSoon("ai");
            },
          }),
        ],
      }),
      card({ title: "Инструменты", body: toolCards }),
      card({
        title: "Настройка инструментов",
        subtitle: "Создание, изменение и удаление шаблонов",
        body: F.repeater({
          get: () => data().tools || [],
          set: (value) => {
            data().tools = value;
            Store.saveModuleSoon("ai");
          },
          blank: Admin.Schema.blanks.aiTool,
          addLabel: "Добавить инструмент",
          emptyText: "Инструментов пока нет",
          itemTitle: (tool) => tool.name || "Без названия",
          renderItem: (tool, index, api) => [
            F.row("2", [
              F.text({
                label: "Название",
                get: () => tool.name,
                set: (value) => api.update({ name: value }),
              }),
              F.select({
                label: "Где применяется",
                options: TARGETS,
                get: () => tool.target,
                set: (value) => api.update({ target: value }),
              }),
            ]),
            F.text({
              label: "Описание",
              get: () => tool.description,
              set: (value) => api.update({ description: value }),
            }),
            F.textarea({
              label: "Шаблон запроса",
              tall: true,
              hint: "Подстановки записываются как {{тема}} и превращаются в поля формы",
              get: () => tool.prompt,
              set: (value) => api.update({ prompt: value }),
            }),
            F.checkbox({
              label: "Инструмент включён",
              get: () => tool.enabled,
              set: (value) => api.update({ enabled: value }),
            }),
          ],
        }),
      }),
    ]);
  }

  Admin.Router.register({
    id: "ai",
    title: "AI-инструменты",
    eyebrow: "Бренд",
    nav: "AI",
    group: "Бренд",
    render,
  });
})();
