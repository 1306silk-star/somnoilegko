/**
 * Раздел «FAQ» — вопросы и ответы аккордеона на сайте.
 */

(function registerFaq() {
  "use strict";

  const { h, card, badge, callout } = Admin.UI;
  const F = Admin.Fields;

  const STATUS_OPTIONS = [
    { value: "published", label: "Опубликовано" },
    { value: "draft", label: "Черновик" },
  ];

  function render() {
    return h("div", { class: "stack" }, [
      callout("info", [
        "Аккордеон открывает один вопрос за раз и работает с клавиатуры. ",
        "Черновики не показываются посетителям.",
      ]),
      card({
        title: "Заголовок раздела",
        body: F.row("2", [
          F.text({ label: "Надзаголовок", path: "faq.label" }),
          F.text({ label: "Заголовок", path: "faq.title" }),
        ]),
      }),
      card({
        title: "Вопросы и ответы",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "../index.html?cms-preview=1#faq",
            target: "_blank",
            rel: "noopener",
            text: "Предпросмотр раздела",
          }),
        ],
        body: F.repeater({
          path: "faq.items",
          blank: Admin.Schema.blanks.faq,
          addLabel: "Добавить вопрос",
          emptyText: "Вопросов пока нет",
          itemTitle: (item) => item.question || "Без вопроса",
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
            F.text({
              label: "Вопрос",
              get: () => item.question,
              set: (value) => api.update({ question: value }),
            }),
            F.textarea({
              label: "Ответ",
              rows: 5,
              get: () => item.answer,
              set: (value) => api.update({ answer: value }),
            }),
          ],
        }),
      }),
    ]);
  }

  Admin.Router.register({
    id: "faq",
    title: "FAQ",
    eyebrow: "Сайт",
    nav: "FAQ",
    group: "Сайт",
    render,
  });
})();
