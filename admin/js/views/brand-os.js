/**
 * Brand OS — хранилище документов бренда: смысл, тон голоса, визуальный язык,
 * правила коммуникации. Документы можно искать, закреплять и копировать в буфер,
 * чтобы использовать как контекст при работе с AI-инструментами.
 */

(function registerBrandOs() {
  "use strict";

  const { h, card, callout, formatDate } = Admin.UI;
  const F = Admin.Fields;
  const Store = Admin.Store;

  const CATEGORIES = [
    "Позиционирование",
    "Коммуникация",
    "Дизайн",
    "Продукт",
    "Процессы",
    "Юридическое",
  ];

  let query = "";

  function data() {
    return Store.getModule("brandOs");
  }

  function docs() {
    return data().docs || [];
  }

  async function persist() {
    await Store.saveModule("brandOs");
  }

  function matches(doc) {
    if (!query) return true;
    const needle = query.toLowerCase();
    return [doc.title, doc.summary, doc.body, doc.category, (doc.tags || []).join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  }

  function openDoc(doc) {
    const close = Admin.UI.modal({
      wide: true,
      title: doc.title,
      body: h("div", { class: "stack" }, [
        h("p", { class: "text-sm muted", text: `${doc.category} · обновлён ${formatDate(doc.updatedAt)}` }),
        doc.summary ? h("p", { class: "text-sm", text: doc.summary }) : null,
        h("div", { class: "ai-output", text: doc.body }),
      ]),
      actions: [
        h("button", {
          class: "btn btn--ghost",
          type: "button",
          text: "Скопировать текст",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(doc.body);
              Admin.UI.toast("Текст скопирован");
            } catch (error) {
              Admin.UI.toast("Браузер не разрешил копирование", "warn");
            }
          },
        }),
        h("button", {
          class: "btn btn--primary",
          type: "button",
          text: "Закрыть",
          onClick: () => close(),
        }),
      ],
    });
  }

  function render() {
    function docRow(doc) {
      return h("article", { class: "record" }, [
        h("div", { class: "record__main" }, [
          h("p", { class: "record__title", text: doc.title }),
          h("div", { class: "record__meta" }, [
            h("span", { class: "badge badge--muted", text: doc.category }),
            h("span", { text: `обновлён ${formatDate(doc.updatedAt)}` }),
            ...(doc.tags || []).map((tag) => h("span", { text: `#${tag}` })),
          ]),
          doc.summary ? h("p", { class: "record__excerpt", text: doc.summary }) : null,
        ]),
        h("div", { class: "record__actions" }, [
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "Читать",
            onClick: () => openDoc(doc),
          }),
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: doc.pinned ? "Открепить" : "Закрепить",
            onClick: async () => {
              doc.pinned = !doc.pinned;
              doc.updatedAt = new Date().toISOString();
              await persist();
              renderResults();
            },
          }),
        ]),
      ]);
    }

    /* Список перерисовывается отдельно от всего раздела — поле поиска
       не пересоздаётся и не теряет фокус во время ввода. */
    const results = h("div", { class: "stack" });

    function renderResults() {
      const visible = docs().filter(matches);
      const pinned = visible.filter((doc) => doc.pinned);
      const rest = visible.filter((doc) => !doc.pinned);

      Admin.UI.clear(results);
      Admin.UI.append(results, [
        pinned.length
          ? card({ title: "Закреплённое", body: h("div", {}, pinned.map(docRow)) })
          : null,
        card({
          title: "Все документы",
          subtitle: `${docs().length} документов в хранилище`,
          body: rest.length
            ? h("div", {}, rest.map(docRow))
            : h("p", {
                class: "text-sm muted",
                text: query
                  ? "Ничего не найдено по этому запросу."
                  : "Все документы закреплены наверху.",
              }),
        }),
      ]);
    }

    renderResults();

    return h("div", { class: "stack" }, [
      callout("info", [
        "Brand OS — рабочая память бренда. Здесь живут решения, которые не должны ",
        "потеряться: обещание, тон голоса, палитра, правила. Эти же документы можно ",
        "передавать AI-инструментам как контекст.",
      ]),
      card({
        title: "Поиск по документам",
        body: F.text({
          label: "Что ищем",
          placeholder: "Например: тон голоса",
          get: () => query,
          set: (value) => {
            query = value;
            renderResults();
          },
        }),
      }),
      results,
      card({
        title: "Редактор документов",
        subtitle: "Создание, изменение и удаление",
        body: F.repeater({
          get: () => docs(),
          set: (value) => {
            data().docs = value;
            Store.saveModuleSoon("brandOs");
            renderResults();
          },
          blank: Admin.Schema.blanks.brandDoc,
          addLabel: "Добавить документ",
          emptyText: "Документов пока нет",
          itemTitle: (doc) => doc.title || "Без названия",
          itemBadge: (doc) =>
            doc.pinned ? h("span", { class: "badge badge--published", text: "Закреплён" }) : null,
          renderItem: (doc, index, api) => [
            F.row("2", [
              F.text({
                label: "Название",
                get: () => doc.title,
                set: (value) => api.update({ title: value, updatedAt: new Date().toISOString() }),
              }),
              F.select({
                label: "Раздел",
                options: CATEGORIES.map((value) => ({ value, label: value })),
                get: () => doc.category,
                set: (value) => api.update({ category: value }),
              }),
            ]),
            F.text({
              label: "Краткое описание",
              get: () => doc.summary,
              set: (value) => api.update({ summary: value }),
            }),
            F.textarea({
              label: "Текст документа",
              tall: true,
              get: () => doc.body,
              set: (value) => api.update({ body: value, updatedAt: new Date().toISOString() }),
            }),
            F.stringList({
              label: "Теги",
              addLabel: "Добавить тег",
              get: () => doc.tags || [],
              set: (value) => api.update({ tags: value }),
            }),
            F.checkbox({
              label: "Закрепить наверху",
              get: () => doc.pinned,
              set: (value) => api.update({ pinned: value }),
            }),
          ],
        }),
      }),
    ]);
  }

  Admin.Router.register({
    id: "brand-os",
    title: "Brand OS",
    eyebrow: "Бренд",
    nav: "Brand OS",
    group: "Бренд",
    render,
  });
})();
