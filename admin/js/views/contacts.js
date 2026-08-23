/**
 * Раздел «Контакты» — финальный CTA, форма обратной связи и данные бренда.
 */

(function registerContacts() {
  "use strict";

  const { h, card, callout } = Admin.UI;
  const F = Admin.Fields;

  function render() {
    return h("div", { class: "stack" }, [
      callout("info", [
        "Форма «Написать мне» не отправляет данные на сервер: она собирает сообщение ",
        "и открывает Telegram. Так работает исходный сайт, поведение сохранено.",
      ]),
      card({
        title: "Данные бренда",
        subtitle: "Используются в подписях и ссылках по всему сайту",
        body: [
          F.row("2", [
            F.text({ label: "Название бренда", path: "site.brand" }),
            F.text({ label: "Имя автора", path: "site.person" }),
          ]),
          F.row("2", [
            F.url({ label: "Telegram", path: "site.telegram" }),
            F.text({ label: "Подпись Telegram", path: "site.telegramHandle" }),
          ]),
          F.row("2", [
            F.url({ label: "GitHub", path: "site.github" }),
            F.url({ label: "Лекс", path: "site.lexHref" }),
          ]),
          F.row("2", [
            F.text({ label: "Email", path: "site.email" }),
            F.text({ label: "Подпись Email", path: "site.emailLabel" }),
          ]),
          F.row("3", [
            F.text({ label: "Латвия, подпись", path: "site.phoneLvLabel" }),
            F.text({ label: "Латвия, номер", path: "site.phoneLv" }),
            F.text({ label: "Пометка", path: "site.phoneLvNote" }),
          ]),
          F.row("3", [
            F.text({ label: "Россия, подпись", path: "site.phoneRuLabel" }),
            F.text({ label: "Россия, номер", path: "site.phoneRu" }),
            F.text({ label: "Пометка", path: "site.phoneRuNote" }),
          ]),
        ],
      }),
      card({
        title: "Финальный призыв",
        actions: [
          h("a", {
            class: "btn btn--ghost btn--sm",
            href: "../index.html?cms-preview=1#contacts",
            target: "_blank",
            rel: "noopener",
            text: "Предпросмотр раздела",
          }),
        ],
        body: [
          F.text({ label: "Заголовок", path: "contacts.title" }),
          F.textarea({ label: "Текст", path: "contacts.text", rows: 3 }),
          F.text({
            label: "Заголовок списка контактов",
            path: "contacts.directoryTitle",
          }),
          F.row("2", [
            F.text({ label: "Основная кнопка", path: "contacts.primaryLabel" }),
            F.url({ label: "Ссылка основной кнопки", path: "contacts.primaryHref" }),
          ]),
          F.row("2", [
            F.text({ label: "Кнопка формы", path: "contacts.modalLabel" }),
            F.text({ label: "Кнопка Лекса", path: "contacts.lexLabel" }),
          ]),
          F.url({ label: "Ссылка на Лекса", path: "contacts.lexHref" }),
          F.row("2", [
            F.text({ label: "Файл фотографии", path: "contacts.photo" }),
            F.text({ label: "Альтернативный текст", path: "contacts.photoAlt" }),
          ]),
        ],
      }),
      card({
        title: "Форма обратной связи",
        subtitle: "Тексты модального окна «Написать мне»",
        body: [
          F.text({ label: "Заголовок окна", path: "contacts.modalTitle" }),
          F.textarea({ label: "Пояснение", path: "contacts.modalSubtitle", rows: 2 }),
          F.text({ label: "Текст кнопки отправки", path: "contacts.modalSubmitLabel" }),
        ],
      }),
    ]);
  }

  Admin.Router.register({
    id: "contacts",
    title: "Контакты",
    eyebrow: "Сайт",
    nav: "Контакты",
    group: "Сайт",
    render,
  });
})();
