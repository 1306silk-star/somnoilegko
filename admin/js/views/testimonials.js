/**
 * Раздел «Отзывы».
 *
 * Секция отзывов появляется на сайте только тогда, когда есть хотя бы один
 * опубликованный отзыв. Пустых карточек посетитель не увидит — это соответствует
 * принципу честной подачи бренда.
 */

(function registerTestimonials() {
  "use strict";

  const { h, card, badge, callout } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  const STATUS_OPTIONS = [
    { value: "published", label: "Опубликовано" },
    { value: "draft", label: "Черновик" },
  ];

  function render() {
    const items = Store.getField("testimonials.items", []);
    const publishedCount = items.filter(
      (item) => (item.status || "published") === "published"
    ).length;

    return h("div", { class: "stack" }, [
      publishedCount
        ? callout("info", [
            `На сайте показывается ${publishedCount} `,
            publishedCount === 1 ? "отзыв" : "отзыва(-ов)",
            ". Секция «Отзывы» видна посетителям.",
          ])
        : callout("warn", [
            h("strong", { text: "Секция скрыта. " }),
            "Пока нет ни одного опубликованного отзыва, блок «Отзывы» не выводится на сайте. ",
            "Так на странице не появляются пустые карточки.",
          ]),
      card({
        title: "Заголовок раздела",
        body: F.row("3", [
          F.text({ label: "Надзаголовок", path: "testimonials.label" }),
          F.text({ label: "Заголовок", path: "testimonials.title" }),
          F.text({ label: "Подзаголовок", path: "testimonials.subtitle" }),
        ]),
      }),
      card({
        title: "Отзывы",
        subtitle: "Публикуйте только реальные отзывы реальных людей",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "../index.html?cms-preview=1#testimonials",
            target: "_blank",
            rel: "noopener",
            text: "Предпросмотр раздела",
          }),
        ],
        body: F.repeater({
          path: "testimonials.items",
          blank: Admin.Schema.blanks.testimonial,
          addLabel: "Добавить отзыв",
          emptyText: "Отзывов пока нет",
          itemTitle: (item) => item.name || "Без имени",
          itemBadge: (item) => badge(item.status || "published"),
          renderItem: (item, index, api) => [
            F.select({
              label: "Статус",
              options: STATUS_OPTIONS,
              get: () => item.status || "published",
              set: (value) => {
                api.update({ status: value });
                api.refresh();
              },
            }),
            F.row("2", [
              F.text({
                label: "Имя",
                get: () => item.name,
                set: (value) => api.update({ name: value }),
              }),
              F.text({
                label: "Кем работает или чем занимается",
                get: () => item.role,
                set: (value) => api.update({ role: value }),
              }),
            ]),
            F.textarea({
              label: "Текст отзыва",
              rows: 5,
              get: () => item.text,
              set: (value) => api.update({ text: value }),
            }),
          ],
        }),
      }),
    ]);
  }

  Admin.Router.register({
    id: "testimonials",
    title: "Отзывы",
    eyebrow: "Сайт",
    nav: "Отзывы",
    group: "Сайт",
    render,
  });
})();
