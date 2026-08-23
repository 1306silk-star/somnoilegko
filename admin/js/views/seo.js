/**
 * Раздел «SEO» — заголовок, описание и карточка для соцсетей.
 * Рядом с полями показывается длина: поисковые системы обрезают длинные строки.
 */

(function registerSeo() {
  "use strict";

  const { h, card, callout } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  const LIMITS = { title: 60, description: 160 };

  function counterFor(path, limit, onUpdate) {
    const node = h("p", { class: "field__hint" });

    function update() {
      const length = String(Store.getField(path, "")).length;
      node.textContent = `${length} из ${limit} символов`;
      node.style.color = length > limit ? "var(--admin-coral-deep)" : "";
      if (onUpdate) onUpdate();
    }

    update();
    return { node, update };
  }

  function render() {
    const preview = h("div", { class: "card card--flat" });

    function renderPreview() {
      Admin.UI.clear(preview);
      Admin.UI.append(preview, [
        h("p", { class: "field__label", text: "Как это выглядит в поиске" }),
        h("p", {
          style: { color: "#1a4bbd", fontSize: "1.0625rem", marginTop: "0.5rem" },
          text: Store.getField("seo.title", "") || "Заголовок страницы",
        }),
        h("p", {
          class: "text-xs muted",
          style: { marginTop: "0.125rem" },
          text: "somnoilegko.ru",
        }),
        h("p", {
          class: "text-sm muted",
          style: { marginTop: "0.375rem" },
          text: Store.getField("seo.description", "") || "Описание страницы",
        }),
      ]);
    }

    const titleCounter = counterFor("seo.title", LIMITS.title, renderPreview);
    const descriptionCounter = counterFor("seo.description", LIMITS.description, renderPreview);

    renderPreview();

    return h("div", { class: "stack" }, [
      callout("info", [
        "Заголовок и описание попадают во вкладку браузера, результаты поиска и ссылку ",
        "в Telegram. Изменения применяются сразу после публикации.",
      ]),
      card({
        title: "Поисковая выдача",
        body: [
          F.text({
            label: "Заголовок страницы (title)",
            path: "seo.title",
            onChange: () => titleCounter.update(),
          }),
          titleCounter.node,
          F.textarea({
            label: "Описание (description)",
            path: "seo.description",
            rows: 3,
            className: "mt-4",
            onChange: () => descriptionCounter.update(),
          }),
          descriptionCounter.node,
          preview,
        ],
      }),
      card({
        title: "Карточка для соцсетей и Telegram",
        subtitle: "Open Graph — то, что видно при отправке ссылки",
        body: [
          F.text({ label: "Заголовок карточки", path: "seo.ogTitle" }),
          F.textarea({ label: "Описание карточки", path: "seo.ogDescription", rows: 3 }),
          F.text({
            label: "Изображение карточки",
            path: "seo.ogImage",
            hint: "Путь относительно корня сайта, например assets/images/about/about.jpg",
          }),
          F.url({
            label: "Канонический адрес страницы",
            path: "seo.canonical",
            hint: "Полный адрес вида https://somnoilegko.ru/",
          }),
        ],
      }),
      card({
        title: "Twitter / X",
        body: [
          F.text({ label: "Заголовок", path: "seo.twitterTitle" }),
          F.textarea({ label: "Описание", path: "seo.twitterDescription", rows: 3 }),
        ],
      }),
    ]);
  }

  Admin.Router.register({
    id: "seo",
    title: "SEO",
    eyebrow: "Сайт",
    nav: "SEO",
    group: "Сайт",
    render,
  });
})();
