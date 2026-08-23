/**
 * Схема данных панели управления.
 *
 * Здесь описано, из чего состоит контент сайта и вспомогательные модули
 * (Telegram, Brand OS, AI, Приложения), а также заготовки новых записей.
 */

window.Admin = window.Admin || {};

Admin.Schema = (function () {
  "use strict";

  const isPlainObject = (value) =>
    Object.prototype.toString.call(value) === "[object Object]";

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isPlainObject(value)) {
      const out = {};
      Object.keys(value).forEach((key) => {
        out[key] = clone(value[key]);
      });
      return out;
    }
    return value;
  }

  function merge(base, patch) {
    if (!isPlainObject(patch)) return patch === undefined ? clone(base) : clone(patch);
    const result = isPlainObject(base) ? clone(base) : {};
    Object.keys(patch).forEach((key) => {
      const next = patch[key];
      if (next === undefined) return;
      result[key] = isPlainObject(next) ? merge(result[key], next) : clone(next);
    });
    return result;
  }

  function uid(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix || "id"}-${Date.now().toString(36)}-${random}`;
  }

  /** Базовый контент — берётся из data/content.js, который читает и сам сайт. */
  function defaultContent() {
    return clone(window.SITE_CONTENT || {});
  }

  /* ───────────────────── Заготовки записей ───────────────────── */

  const blanks = {
    project() {
      return {
        id: uid("project"),
        status: "draft",
        category: "Для работы",
        variant: "work",
        title: "Новый проект",
        task: "",
        solution: "",
        benefits: [],
        tags: [],
        primaryLabel: "Открыть проект",
        url: "",
        statusLabel: "",
        githubLabel: "Посмотреть код на GitHub",
        github: "",
        embedUrl: "",
        embedLabel: "",
      };
    },

    case() {
      return {
        id: uid("case"),
        status: "draft",
        title: "Новый кейс",
        text: "",
        linkLabel: "",
        linkHref: "",
      };
    },

    faq() {
      return {
        id: uid("faq"),
        status: "draft",
        question: "Новый вопрос",
        answer: "",
      };
    },

    testimonial() {
      return {
        id: uid("testimonial"),
        status: "draft",
        name: "Имя",
        role: "",
        text: "",
      };
    },

    navItem() {
      return { label: "Пункт меню", href: "#" };
    },

    footerLink() {
      return { label: "Ссылка", href: "#" };
    },

    whatIDoItem() {
      return { name: "Направление", text: "", size: "normal" };
    },

    recognizeItem() {
      return { icon: "icon-help", text: "Новая ситуация" };
    },

    routeItem() {
      return {
        title: "Новый маршрут",
        text: "",
        btnLabel: "Обсудить задачу",
        btnHref: "https://t.me/somnoi_legko",
        featured: false,
      };
    },

    roadmapItem() {
      return { title: "Новый пункт", status: "planned" };
    },

    telegramPost() {
      return {
        id: uid("post"),
        title: "",
        text: "",
        imageUrl: "",
        linkPreview: true,
        silent: false,
        status: "draft",
        scheduledAt: "",
        publishedAt: "",
        messageId: null,
        error: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },

    brandDoc() {
      return {
        id: uid("doc"),
        title: "Новый документ",
        category: "Позиционирование",
        summary: "",
        body: "",
        tags: [],
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },

    aiTool() {
      return {
        id: uid("tool"),
        name: "Новый AI-инструмент",
        description: "",
        prompt: "",
        target: "manual",
        enabled: true,
      };
    },

    app() {
      return {
        id: uid("app"),
        name: "Новое приложение",
        url: "",
        description: "",
        icon: "",
        embed: true,
        external: true,
        status: "active",
      };
    },
  };

  /* ───────────────────── Значения по умолчанию модулей ───────────────────── */

  function defaultTelegram() {
    return {
      settings: {
        botToken: "",
        chatId: "",
        channelUrl: "https://t.me/somnoi_legko",
        parseMode: "HTML",
        transport: "server",
      },
      posts: [],
    };
  }

  function defaultBrandOs() {
    return {
      docs: [
        {
          id: "brand-core",
          title: "Обещание бренда",
          category: "Позиционирование",
          summary: "Главная мысль, вокруг которой строятся все тексты и решения.",
          body:
            "Со мной легко использовать искусственный интеллект в работе и жизни.\n\n" +
            "Задача бренда — создать образ человека, который помогает другим чувствовать " +
            "себя увереннее рядом с новыми технологиями. Не технологии ради технологий, " +
            "а понятная польза: экономия времени, простые инструменты, спокойное обучение.",
          tags: ["основа", "смысл"],
          pinned: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "brand-voice",
          title: "Тон голоса",
          category: "Коммуникация",
          summary: "Как звучит бренд и чего в текстах не бывает.",
          body:
            "Спокойно. Доброжелательно. Уверенно. По-человечески. Профессионально.\n\n" +
            "Без давления, без высокомерия, без обещаний «волшебной кнопки».\n\n" +
            "Не используем: технический жаргон, агрессивные продажи, выдуманные отзывы, " +
            "клише вроде «революция» и «будущее уже наступило».",
          tags: ["тексты", "стиль"],
          pinned: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "brand-visual",
          title: "Визуальный язык",
          category: "Дизайн",
          summary: "Палитра, шрифты и принципы композиции.",
          body:
            "Направление: тёплый технологичный минимализм.\n\n" +
            "Палитра: тёплый светлый фон #f7f4ef, глубокий зелёный #1e4d3a как цвет доверия, " +
            "коралловый акцент #d4726a, графитовый текст #2a2a2a.\n\n" +
            "Шрифты: Literata для заголовков, Golos Text для основного текста.\n\n" +
            "Композиция: много воздуха, чередование светлых и насыщенных секций, " +
            "асимметрия без хаоса, разные типы блоков вместо одной сетки карточек.",
          tags: ["палитра", "типографика"],
          pinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
  }

  function defaultAi() {
    return {
      settings: {
        provider: "none",
        apiKey: "",
        model: "",
        endpoint: "",
      },
      tools: [
        {
          id: "tool-post",
          name: "Черновик поста для Telegram",
          description:
            "Собирает структуру публикации по короткой мысли: крючок, польза, действие.",
          prompt:
            "Ты пишешь для бренда «Сомной_легко» (Ирина Андреева, AI для работы и жизни).\n" +
            "Тон: спокойный, доброжелательный, без жаргона и без обещаний «волшебной кнопки».\n\n" +
            "Сделай короткий пост для Telegram на тему: {{тема}}.\n" +
            "Структура: цепляющая первая строка, 2–3 абзаца пользы, мягкий призыв к действию.",
          target: "telegram",
          enabled: true,
        },
        {
          id: "tool-seo",
          name: "SEO-описание страницы",
          description: "Предлагает title и description в границах допустимой длины.",
          prompt:
            "Составь SEO-заголовок (до 60 символов) и описание (до 160 символов) " +
            "для страницы сайта «Сомной_легко». Тема страницы: {{тема}}.\n" +
            "Пиши по-русски, спокойно и понятно, без превосходных степеней.",
          target: "seo",
          enabled: true,
        },
        {
          id: "tool-faq",
          name: "Ответ для FAQ",
          description: "Готовит понятный ответ на частый вопрос клиента.",
          prompt:
            "Клиент спрашивает: {{вопрос}}.\n" +
            "Ответь от лица Ирины Андреевой — спокойно, простым языком, 2–4 предложения, " +
            "без технических терминов.",
          target: "faq",
          enabled: true,
        },
      ],
      history: [],
    };
  }

  function defaultApps() {
    return {
      apps: [
        {
          id: "app-time",
          name: "Время",
          url: "https://time.somnoilegko.ru",
          description:
            "Внешнее приложение экосистемы «Сомной_легко». Работает самостоятельно, " +
            "панель только подключает его и открывает.",
          icon: "Вр",
          embed: true,
          external: true,
          status: "active",
          builtin: true,
        },
      ],
    };
  }

  return {
    clone,
    merge,
    uid,
    isPlainObject,
    defaultContent,
    defaultTelegram,
    defaultBrandOs,
    defaultAi,
    defaultApps,
    blanks,
  };
})();
