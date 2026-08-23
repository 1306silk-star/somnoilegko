/**
 * Раздел «Проекты» — карточки инструментов в блоке «Инструменты для работы и жизни».
 * Черновики не попадают на сайт, пока не переведены в статус «Опубликовано».
 */

(function registerProjects() {
  "use strict";

  const { h, card, badge, callout } = Admin.UI;
  const F = Admin.Fields;

  const STATUS_OPTIONS = [
    { value: "published", label: "Опубликовано" },
    { value: "draft", label: "Черновик" },
  ];

  const VARIANT_OPTIONS = [
    { value: "work", label: "Для работы" },
    { value: "life", label: "Для жизни" },
  ];

  function render() {
    return h("div", { class: "stack" }, [
      callout("info", [
        "Порядок карточек на сайте совпадает с порядком в этом списке. ",
        "Чётные карточки автоматически разворачиваются зеркально — это часть вёрстки.",
      ]),
      card({
        title: "Заголовок раздела",
        body: F.row("3", [
          F.text({ label: "Надзаголовок", path: "projects.label" }),
          F.text({ label: "Заголовок", path: "projects.title" }),
          F.text({ label: "Подзаголовок", path: "projects.subtitle" }),
        ]),
      }),
      card({
        title: "Карточки проектов",
        subtitle: "Задача, решение, польза, живой экран и действия",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "../index.html?cms-preview=1#projects",
            target: "_blank",
            rel: "noopener",
            text: "Предпросмотр раздела",
          }),
        ],
        body: F.repeater({
          path: "projects.items",
          blank: Admin.Schema.blanks.project,
          addLabel: "Добавить проект",
          emptyText: "Проектов пока нет. Добавьте первый — он появится в разделе «Инструменты».",
          itemTitle: (item) => item.title || "Без названия",
          itemBadge: (item) => badge(item.status || "published"),
          renderItem: (item, index, api) => [
            F.row("2", [
              F.select({
                label: "Статус",
                options: STATUS_OPTIONS,
                get: () => item.status || "published",
                set: (value) => {
                  api.update({ status: value });
                  api.refresh();
                },
              }),
              F.select({
                label: "Оформление",
                options: VARIANT_OPTIONS,
                get: () => item.variant || "work",
                set: (value) => api.update({ variant: value }),
              }),
            ]),
            F.row("2", [
              F.text({
                label: "Название",
                get: () => item.title,
                set: (value) => api.update({ title: value }),
              }),
            F.text({
              label: "Категория",
              hint: "Подпись над названием, например «Для работы»",
              get: () => item.category,
              set: (value) => api.update({ category: value }),
            }),
            F.text({
              label: "Честный статус",
              hint: "Например: «Практический мини-сервис». Не пишите «готовый продукт», если это не так.",
              get: () => item.statusLabel || "",
              set: (value) => api.update({ statusLabel: value }),
            }),
            ]),
            F.textarea({
              label: "Задача",
              rows: 2,
              get: () => item.task,
              set: (value) => api.update({ task: value }),
            }),
            F.textarea({
              label: "Решение",
              rows: 2,
              get: () => item.solution,
              set: (value) => api.update({ solution: value }),
            }),
            F.stringList({
              label: "Польза",
              addLabel: "Добавить пункт",
              get: () => item.benefits || [],
              set: (value) => api.update({ benefits: value }),
            }),
            F.stringList({
              label: "Метки",
              hint: "Короткие слова: бесплатно, без регистрации, работает в браузере",
              addLabel: "Добавить метку",
              get: () => item.tags || [],
              set: (value) => api.update({ tags: value }),
            }),
            h("hr", { class: "divider" }),
            F.row("2", [
              F.text({
                label: "Текст основной кнопки",
                get: () => item.primaryLabel,
                set: (value) => api.update({ primaryLabel: value }),
              }),
              F.url({
                label: "Ссылка на проект",
                get: () => item.url,
                set: (value) => api.update({ url: value }),
              }),
            ]),
            F.row("2", [
              F.text({
                label: "Текст кнопки GitHub",
                get: () => item.githubLabel,
                set: (value) => api.update({ githubLabel: value }),
              }),
              F.url({
                label: "Ссылка на репозиторий",
                get: () => item.github,
                set: (value) => api.update({ github: value }),
              }),
            ]),
            F.row("2", [
              F.url({
                label: "Адрес для живого превью",
                hint: "Оставьте пустым, если встраивать приложение не нужно",
                get: () => item.embedUrl,
                set: (value) => api.update({ embedUrl: value }),
              }),
              F.text({
                label: "Подпись в адресной строке превью",
                get: () => item.embedLabel,
                set: (value) => api.update({ embedLabel: value }),
              }),
            ]),
          ],
        }),
      }),
    ]);
  }

  Admin.Router.register({
    id: "projects",
    title: "Проекты",
    eyebrow: "Сайт",
    nav: "Проекты",
    group: "Сайт",
    render,
  });
})();
