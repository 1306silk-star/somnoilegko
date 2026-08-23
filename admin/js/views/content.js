/**
 * Раздел «Главная страница» — тексты, заголовки, подзаголовки и кнопки сайта.
 *
 * Каждая вкладка соответствует смысловому блоку страницы, порядок совпадает
 * с порядком блоков на сайте — так проще находить нужное поле.
 */

(function registerContent() {
  "use strict";

  const { h, card, tabs, callout } = Admin.UI;
  const F = Admin.Fields;
  const B = Admin.Schema.blanks;

  const ICON_OPTIONS = [
    { value: "icon-mail", label: "Письмо" },
    { value: "icon-bulb", label: "Идея" },
    { value: "icon-list", label: "Список" },
    { value: "icon-pen", label: "Перо" },
    { value: "icon-plane", label: "Самолёт" },
    { value: "icon-wallet", label: "Кошелёк" },
    { value: "icon-globe", label: "Глобус" },
    { value: "icon-search", label: "Поиск" },
    { value: "icon-chat", label: "Диалог" },
    { value: "icon-help", label: "Вопрос" },
    { value: "icon-briefcase", label: "Портфель" },
    { value: "icon-home", label: "Дом" },
  ];

  const SIZE_OPTIONS = [
    { value: "normal", label: "Обычный" },
    { value: "featured", label: "Крупный" },
    { value: "wide", label: "Широкий" },
    { value: "accent", label: "Акцентный" },
    { value: "dark", label: "Тёмный" },
  ];

  /* ───────────────────── Шапка ───────────────────── */

  function headerTab() {
    return h("div", { class: "stack" }, [
      card({
        title: "Кнопка в шапке",
        subtitle: "Показывается и в мобильном меню",
        body: F.row("2", [
          F.text({ label: "Текст кнопки", path: "header.ctaLabel" }),
          F.url({ label: "Ссылка", path: "header.ctaHref" }),
        ]),
      }),
      card({
        title: "Пункты меню",
        subtitle: "Порядок в шапке, мобильном меню и якоря страницы",
        body: F.repeater({
          path: "header.nav",
          blank: B.navItem,
          addLabel: "Добавить пункт",
          emptyText: "В меню нет ни одного пункта",
          itemTitle: (item) => item.label || "Без названия",
          renderItem: (item, index, api) =>
            F.row("2", [
              F.text({
                label: "Название",
                get: () => item.label,
                set: (value) => api.update({ label: value }),
              }),
              F.text({
                label: "Ссылка",
                hint: "Якорь вида #faq или полный адрес",
                get: () => item.href,
                set: (value) => api.update({ href: value }),
              }),
            ]),
        }),
      }),
    ]);
  }

  /* ───────────────────── Первый экран ───────────────────── */

  function heroTab() {
    return h("div", { class: "stack" }, [
      callout("info", [
        "Заголовок разбивается на слова автоматически — каждое слово появляется по очереди. ",
        "Слова из поля «Акцентные слова» подсвечиваются фирменным цветом.",
      ]),
      card({
        title: "Заголовок",
        body: [
          F.text({ label: "Надзаголовок", path: "hero.eyebrow" }),
          F.row("2", [
            F.text({ label: "Первая строка", path: "hero.titleLine1" }),
            F.text({ label: "Вторая строка", path: "hero.titleLine2" }),
          ]),
          F.stringList({
            label: "Акцентные слова",
            path: "hero.accentWords",
            hint: "Слово должно совпадать со словом в заголовке, включая знаки препинания",
            addLabel: "Добавить слово",
            emptyText: "Акцентных слов нет",
          }),
          F.checkbox({ label: "Показывать тире после первой строки", path: "hero.showDash" }),
          F.text({
            label: "Фирменная фраза",
            path: "hero.promise",
            hint: "Короткая мысль рядом с заголовком, например «Со мной — легко и понятно»",
            className: "mt-4",
          }),
          F.textarea({
            label: "Подзаголовок",
            path: "hero.lead",
            rows: 3,
            hint: "Кто вы, чем занимаетесь и какой результат получает человек",
          }),
        ],
      }),
      card({
        title: "Кнопки",
        body: [
          F.row("2", [
            F.text({ label: "Основная кнопка", path: "hero.primaryLabel" }),
            F.text({ label: "Ссылка основной кнопки", path: "hero.primaryHref" }),
          ]),
          F.row("2", [
            F.text({ label: "Вторая кнопка", path: "hero.secondaryLabel" }),
            F.text({ label: "Ссылка второй кнопки", path: "hero.secondaryHref" }),
          ]),
        ],
      }),
      card({
        title: "Фотография",
        subtitle: "Путь указывается относительно корня сайта",
        body: [
          F.row("2", [
            F.text({ label: "Файл изображения", path: "hero.photo" }),
            F.text({ label: "Подпись-плашка", path: "hero.badge" }),
          ]),
          F.text({
            label: "Альтернативный текст",
            path: "hero.photoAlt",
            hint: "Описание фотографии для программ чтения с экрана и поисковых систем",
          }),
        ],
      }),
    ]);
  }

  /* ───────────────────── Направления ───────────────────── */

  function directionsTab() {
    return card({
      title: "Что я делаю",
      subtitle: "Нумерация проставляется автоматически по порядку",
      body: [
        F.row("2", [
          F.text({ label: "Надзаголовок", path: "whatIDo.label" }),
          F.text({ label: "Заголовок", path: "whatIDo.title" }),
        ]),
        F.repeater({
          path: "whatIDo.items",
          blank: B.whatIDoItem,
          addLabel: "Добавить направление",
          emptyText: "Направлений пока нет",
          itemTitle: (item) => item.name || "Без названия",
          renderItem: (item, index, api) =>
            [
              F.row("2", [
                F.text({
                  label: "Название",
                  get: () => item.name,
                  set: (value) => api.update({ name: value }),
                }),
                F.select({
                  label: "Размер плитки",
                  options: SIZE_OPTIONS,
                  get: () => item.size || "normal",
                  set: (value) => api.update({ size: value }),
                }),
              ]),
              F.textarea({
                label: "Короткое описание",
                rows: 2,
                get: () => item.text || "",
                set: (value) => api.update({ text: value }),
              }),
            ],
        }),
      ],
    });
  }

  /* ───────────────────── Задачи ───────────────────── */

  function tasksTab() {
    return h("div", { class: "stack" }, [
      card({
        title: "Блок «Знакомо?»",
        body: [
          F.text({ label: "Заголовок", path: "recognize.title" }),
          F.textarea({
            label: "Вывод под заголовком",
            path: "recognize.conclusion",
            hint: "Перенос строки в поле станет переносом строки на сайте",
            rows: 3,
          }),
          F.repeater({
            label: "Ситуации",
            path: "recognize.items",
            blank: B.recognizeItem,
            addLabel: "Добавить ситуацию",
            emptyText: "Ситуаций пока нет",
            itemTitle: (item) => item.text || "Без текста",
            renderItem: (item, index, api) =>
              F.row("2", [
                F.text({
                  label: "Текст",
                  get: () => item.text,
                  set: (value) => api.update({ text: value }),
                }),
                F.select({
                  label: "Иконка",
                  options: ICON_OPTIONS,
                  get: () => item.icon || "icon-help",
                  set: (value) => api.update({ icon: value }),
                }),
              ]),
          }),
        ],
      }),
      card({
        title: "Что можно упростить",
        body: [
          F.row("2", [
            F.text({ label: "Надзаголовок", path: "simplify.label" }),
            F.text({ label: "Заголовок", path: "simplify.title" }),
          ]),
          h("hr", { class: "divider" }),
          h("h3", { class: "view__section-title", text: "Для работы" }),
          F.row("2", [
            F.text({ label: "Заголовок области", path: "simplify.work.title" }),
            F.text({ label: "Текст кнопки", path: "simplify.work.ctaLabel" }),
          ]),
          F.url({ label: "Ссылка кнопки", path: "simplify.work.ctaHref" }),
          F.stringList({
            label: "Задачи",
            path: "simplify.work.tasks",
            addLabel: "Добавить задачу",
          }),
          h("hr", { class: "divider" }),
          h("h3", { class: "view__section-title", text: "Для жизни" }),
          F.row("2", [
            F.text({ label: "Заголовок области", path: "simplify.life.title" }),
            F.text({ label: "Текст кнопки", path: "simplify.life.ctaLabel" }),
          ]),
          F.url({ label: "Ссылка кнопки", path: "simplify.life.ctaHref" }),
          F.stringList({
            label: "Задачи",
            path: "simplify.life.tasks",
            addLabel: "Добавить задачу",
          }),
        ],
      }),
    ]);
  }

  /* ───────────────────── Маршруты ───────────────────── */

  function routesTab() {
    return card({
      title: "С чего начать",
      subtitle: "Три сценария входа для посетителя",
      body: [
        F.row("3", [
          F.text({ label: "Надзаголовок", path: "routes.label" }),
          F.text({ label: "Заголовок", path: "routes.title" }),
          F.text({ label: "Подзаголовок", path: "routes.subtitle" }),
        ]),
        F.repeater({
          path: "routes.items",
          blank: B.routeItem,
          addLabel: "Добавить маршрут",
          emptyText: "Маршрутов пока нет",
          itemTitle: (item) => item.title || "Без названия",
          renderItem: (item, index, api) => [
            F.text({
              label: "Заголовок",
              get: () => item.title,
              set: (value) => api.update({ title: value }),
            }),
            F.textarea({
              label: "Описание",
              rows: 2,
              get: () => item.text,
              set: (value) => api.update({ text: value }),
            }),
            F.row("2", [
              F.text({
                label: "Текст кнопки",
                get: () => item.btnLabel,
                set: (value) => api.update({ btnLabel: value }),
              }),
              F.text({
                label: "Ссылка кнопки",
                get: () => item.btnHref,
                set: (value) => api.update({ btnHref: value }),
              }),
            ]),
            F.checkbox({
              label: "Выделить как основной маршрут",
              get: () => item.featured,
              set: (value) => api.update({ featured: value }),
            }),
          ],
        }),
      ],
    });
  }

  /* ───────────────────── Подход ───────────────────── */

  function approachTab() {
    return card({
      title: "Мой подход",
      body: [
        F.text({ label: "Надзаголовок", path: "approach.label" }),
        F.stringList({
          label: "Манифест",
          path: "approach.manifesto",
          hint: "Короткие строки, которые появляются одна за другой",
          addLabel: "Добавить строку",
        }),
        F.text({
          label: "Номер акцентной строки",
          type: "number",
          path: "approach.accentIndex",
          hint: "Отсчёт с нуля: 0 — первая строка, 1 — вторая",
          get: () => Admin.Store.getField("approach.accentIndex", 0),
          set: (value) => Admin.Store.setField("approach.accentIndex", Number(value) || 0),
        }),
        F.stringList({
          label: "Шаги работы",
          path: "approach.steps",
          hint: "Номера 01, 02, 03 проставляются автоматически",
          addLabel: "Добавить шаг",
        }),
        F.textarea({ label: "Цитата в конце блока", path: "approach.quote", rows: 3 }),
      ],
    });
  }

  /* ───────────────────── Обо мне ───────────────────── */

  function aboutTab() {
    return card({
      title: "Обо мне",
      body: [
        F.text({ label: "Заголовок", path: "about.title" }),
        F.row("2", [
          F.text({ label: "Файл фотографии", path: "about.photo" }),
          F.text({ label: "Альтернативный текст", path: "about.photoAlt" }),
        ]),
        F.repeater({
          label: "Абзацы",
          path: "about.paragraphs",
          blank: () => "",
          allowDuplicate: false,
          addLabel: "Добавить абзац",
          emptyText: "Текста пока нет",
          itemTitle: (item, index) =>
            String(item || "").slice(0, 60) || `Абзац ${index + 1}`,
          renderItem: (item, index, api) =>
            F.textarea({
              label: `Абзац ${index + 1}`,
              rows: 4,
              get: () => item,
              set: (value) => {
                const next = [...Admin.Store.getField("about.paragraphs", [])];
                next[index] = value;
                Admin.Store.setField("about.paragraphs", next);
              },
            }),
        }),
        F.stringList({
          label: "Факты",
          path: "about.facts",
          addLabel: "Добавить факт",
        }),
      ],
    });
  }

  /* ───────────────────── Лекс ───────────────────── */

  function lexTab() {
    return h("div", { class: "stack" }, [
      callout("info", [
        "Это главный актуальный кейс на сайте. Кнопка ведёт к Лексу. ",
        "Telegram — канал взаимодействия, а не единственный способ описать продукт.",
      ]),
      card({
        title: "Блок Лекса",
        body: [
          F.text({ label: "Надзаголовок", path: "lex.label" }),
          F.text({ label: "Заголовок", path: "lex.title" }),
          F.textarea({ label: "Основной текст", path: "lex.lead", rows: 5 }),
          F.textarea({ label: "Пояснение про каналы", path: "lex.note", rows: 2 }),
          F.repeater({
            label: "Три пояснения рядом",
            path: "lex.facts",
            blank: () => ({ title: "", text: "" }),
            addLabel: "Добавить пункт",
            emptyText: "Пояснений пока нет",
            itemTitle: (item) => item.title || "Без названия",
            renderItem: (item, index, api) => [
              F.text({
                label: "Заголовок",
                get: () => item.title,
                set: (value) => api.update({ title: value }),
              }),
              F.textarea({
                label: "Текст",
                rows: 3,
                get: () => item.text,
                set: (value) => api.update({ text: value }),
              }),
            ],
          }),
          F.row("2", [
            F.text({ label: "Основная кнопка", path: "lex.primaryLabel" }),
            F.url({ label: "Ссылка основной кнопки", path: "lex.primaryHref" }),
          ]),
          F.row("2", [
            F.text({ label: "Вторая кнопка", path: "lex.secondaryLabel" }),
            F.text({ label: "Ссылка второй кнопки", path: "lex.secondaryHref" }),
          ]),
          F.row("2", [
            F.text({ label: "Файл фотографии", path: "lex.photo" }),
            F.text({
              label: "Альтернативный текст",
              path: "lex.photoAlt",
              hint: "Например: Лекс — персональный ИИ-ассистент Ирины Андреевой",
            }),
          ]),
        ],
      }),
    ]);
  }

  /* ───────────────────── Навыки ───────────────────── */

  function skillsTab() {
    return card({
      title: "Навыки",
      subtitle: "Показывайте только подтверждённые умения",
      body: [
        F.text({ label: "Заголовок списка", path: "skills.label" }),
        F.stringList({
          label: "Навыки",
          path: "skills.items",
          addLabel: "Добавить навык",
          emptyText: "Список навыков пуст",
        }),
      ],
    });
  }

  /* ───────────────────── Планы ───────────────────── */

  function roadmapTab() {
    return card({
      title: "Что появится дальше",
      body: [
        F.row("3", [
          F.text({ label: "Надзаголовок", path: "roadmap.label" }),
          F.text({ label: "Заголовок", path: "roadmap.title" }),
          F.text({ label: "Подзаголовок", path: "roadmap.subtitle" }),
        ]),
        F.row("2", [
          F.text({ label: "Текст кнопки", path: "roadmap.ctaLabel" }),
          F.url({ label: "Ссылка кнопки", path: "roadmap.ctaHref" }),
        ]),
        F.repeater({
          label: "Планы",
          path: "roadmap.items",
          blank: B.roadmapItem,
          addLabel: "Добавить пункт",
          emptyText: "Планов пока нет",
          itemTitle: (item) => item.title || "Без названия",
          renderItem: (item, index, api) =>
            F.row("2", [
              F.text({
                label: "Название",
                get: () => item.title,
                set: (value) => api.update({ title: value }),
              }),
              F.select({
                label: "Статус",
                options: [
                  { value: "planned", label: "Запланировано" },
                  { value: "dev", label: "В разработке" },
                ],
                get: () => item.status || "planned",
                set: (value) => api.update({ status: value }),
              }),
            ]),
        }),
      ],
    });
  }

  /* ───────────────────── Футер ───────────────────── */

  function footerTab() {
    return card({
      title: "Футер",
      body: [
        F.textarea({
          label: "Подпись под логотипом",
          path: "footer.tagline",
          rows: 3,
        }),
        F.text({ label: "Заголовок колонки ссылок", path: "footer.linksHeading" }),
        F.text({ label: "Нижняя строка", path: "footer.bottom" }),
        F.repeater({
          label: "Ссылки",
          path: "footer.links",
          blank: B.footerLink,
          addLabel: "Добавить ссылку",
          emptyText: "Ссылок пока нет",
          itemTitle: (item) => item.label || "Без названия",
          renderItem: (item, index, api) =>
            F.row("2", [
              F.text({
                label: "Название",
                get: () => item.label,
                set: (value) => api.update({ label: value }),
              }),
              F.text({
                label: "Ссылка",
                get: () => item.href,
                set: (value) => api.update({ href: value }),
              }),
            ]),
        }),
      ],
    });
  }

  function render() {
    return tabs(
      [
        { id: "hero", label: "Первый экран", render: heroTab },
        { id: "header", label: "Шапка и меню", render: headerTab },
        { id: "directions", label: "Направления", render: directionsTab },
        { id: "skills", label: "Навыки", render: skillsTab },
        { id: "lex", label: "Лекс", render: lexTab },
        { id: "tasks", label: "Задачи", render: tasksTab },
        { id: "routes", label: "Маршруты", render: routesTab },
        { id: "approach", label: "Подход", render: approachTab },
        { id: "about", label: "Обо мне", render: aboutTab },
        { id: "roadmap", label: "Планы", render: roadmapTab },
        { id: "footer", label: "Футер", render: footerTab },
      ],
      { memory: "content" }
    );
  }

  Admin.Router.register({
    id: "content",
    title: "Главная страница",
    eyebrow: "Сайт",
    nav: "Главная страница",
    group: "Сайт",
    render,
  });
})();
