/**
 * Раздел «Кейсы» — блок «Первые результаты» на сайте.
 */

(function registerCases() {
  "use strict";

  const { h, card, badge } = Admin.UI;
  const F = Admin.Fields;

  const STATUS_OPTIONS = [
    { value: "published", label: "Опубликовано" },
    { value: "draft", label: "Черновик" },
  ];

  function render() {
    return h("div", { class: "stack" }, [
      card({
        title: "Заголовок раздела",
        body: [
          F.row("2", [
            F.text({ label: "Надзаголовок", path: "cases.label" }),
            F.text({ label: "Заголовок", path: "cases.title" }),
          ]),
          F.textarea({ label: "Вступление", path: "cases.intro", rows: 3 }),
          F.textarea({ label: "Заключительная заметка", path: "cases.note", rows: 3 }),
        ],
      }),
      card({
        title: "Кейсы",
        subtitle: "Выстраиваются в вертикальную ленту с отметками времени",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "../index.html?cms-preview=1#results",
            target: "_blank",
            rel: "noopener",
            text: "Предпросмотр раздела",
          }),
        ],
        body: F.repeater({
          path: "cases.items",
          blank: Admin.Schema.blanks.case,
          addLabel: "Добавить кейс",
          emptyText: "Кейсов пока нет",
          itemTitle: (item) => item.title || "Без названия",
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
              label: "Заголовок",
              get: () => item.title,
              set: (value) => api.update({ title: value }),
            }),
            F.textarea({
              label: "Описание",
              rows: 3,
              get: () => item.text,
              set: (value) => api.update({ text: value }),
            }),
            F.row("2", [
              F.text({
                label: "Текст ссылки",
                hint: "Оставьте пустым, если ссылка не нужна",
                get: () => item.linkLabel,
                set: (value) => api.update({ linkLabel: value }),
              }),
              F.url({
                label: "Адрес ссылки",
                get: () => item.linkHref,
                set: (value) => api.update({ linkHref: value }),
              }),
            ]),
          ],
        }),
      }),
    ]);
  }

  Admin.Router.register({
    id: "cases",
    title: "Кейсы",
    eyebrow: "Сайт",
    nav: "Кейсы",
    group: "Сайт",
    render,
  });
})();
