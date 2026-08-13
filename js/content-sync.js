/**
 * Content Sync — связывает сайт с контентом из data/content.js и админ-панели.
 *
 * Порядок слоёв (каждый следующий перекрывает предыдущий):
 *   1. data/content.js            — опубликованный контент в файле репозитория;
 *   2. localStorage «published»   — публикация из админки без сервера (виден владельцу);
 *   3. localStorage «draft»       — черновик, применяется только в режиме предпросмотра.
 *
 * Скрипт подключается до остальных скриптов сайта, поэтому анимации Hero,
 * scroll-reveal, аккордеон и эффекты инициализируются уже на готовой разметке.
 * Если контента нет — сайт остаётся ровно таким, каким свёрстан в index.html.
 */

(function initContentSync() {
  "use strict";

  const STORAGE_PUBLISHED = "somnoilegko.cms.published";
  const STORAGE_DRAFT = "somnoilegko.cms.draft";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const XLINK_NS = "http://www.w3.org/1999/xlink";

  /* ─────────────────────────── Утилиты ─────────────────────────── */

  const isPlainObject = (value) =>
    Object.prototype.toString.call(value) === "[object Object]";

  function deepMerge(base, patch) {
    if (!isPlainObject(patch)) return patch === undefined ? base : patch;
    const result = isPlainObject(base) ? { ...base } : {};
    Object.keys(patch).forEach((key) => {
      const next = patch[key];
      if (next === undefined) return;
      result[key] = isPlainObject(next) ? deepMerge(result[key], next) : next;
    });
    return result;
  }

  function readStorage(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function getByPath(source, path) {
    return path
      .split(".")
      .reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
  }

  /** Пишет текст, превращая переводы строк в <br> — без innerHTML. */
  function writeText(element, value) {
    if (value == null) return;
    const text = String(value);
    element.textContent = "";
    text.split("\n").forEach((line, index) => {
      if (index > 0) element.appendChild(document.createElement("br"));
      element.appendChild(document.createTextNode(line));
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) writeText(node, text);
    return node;
  }

  function icon(symbolId, className) {
    const wrap = document.createElement("span");
    wrap.className = className;
    wrap.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS(SVG_NS, "svg");
    const use = document.createElementNS(SVG_NS, "use");
    const href = `assets/icons.svg#${symbolId}`;
    use.setAttribute("href", href);
    use.setAttributeNS(XLINK_NS, "xlink:href", href);
    svg.appendChild(use);
    wrap.appendChild(svg);
    return wrap;
  }

  function link(className, label, href, options) {
    const opts = options || {};
    const node = document.createElement("a");
    node.className = className;
    writeText(node, label);
    node.href = href || "#";
    if (isExternal(href)) {
      node.target = "_blank";
      node.rel = "noopener noreferrer";
    } else if (opts.navLink !== false && String(href || "").startsWith("#")) {
      node.setAttribute("data-nav-link", "");
    }
    if (opts.magnetic) node.setAttribute("data-magnetic", "");
    return node;
  }

  function isExternal(href) {
    return /^https?:\/\//i.test(String(href || ""));
  }

  function delayClass(index) {
    const step = Math.min(Math.floor(index / 2) + (index > 0 ? 1 : 0), 3);
    return step > 0 ? ` reveal--delay-${Math.min(step, 3)}` : "";
  }

  function isVisible(item) {
    return !item || !item.status || item.status === "published";
  }

  /* ─────────────────────── Простые текстовые поля ─────────────────────── */

  function applyFields(root, content) {
    root.querySelectorAll("[data-cms]").forEach((node) => {
      const value = getByPath(content, node.getAttribute("data-cms"));
      if (value == null) return;
      writeText(node, value);
    });

    root.querySelectorAll("[data-cms-attr]").forEach((node) => {
      node
        .getAttribute("data-cms-attr")
        .split(",")
        .forEach((pair) => {
          const [attr, path] = pair.split(":").map((part) => part.trim());
          if (!attr || !path) return;
          const value = getByPath(content, path);
          if (value == null || value === "") return;
          node.setAttribute(attr, value);
          if (attr === "href" && isExternal(value) && node.tagName === "A") {
            node.target = "_blank";
            node.rel = "noopener noreferrer";
          }
        });
    });
  }

  /* ─────────────────────────── SEO ─────────────────────────── */

  function applySeo(seo) {
    if (!seo) return;
    if (seo.title) document.title = seo.title;

    // Поля соцсетей необязательны: пустые подхватывают основной заголовок
    // и описание, чтобы превью ссылки не расходилось с сайтом.
    const ogTitle = seo.ogTitle || seo.title;
    const ogDescription = seo.ogDescription || seo.description;

    const metaMap = [
      ['meta[name="description"]', seo.description],
      ['meta[property="og:title"]', ogTitle],
      ['meta[property="og:description"]', ogDescription],
      ['meta[property="og:image"]', seo.ogImage],
      ['meta[name="twitter:title"]', seo.twitterTitle || ogTitle],
      ['meta[name="twitter:description"]', seo.twitterDescription || ogDescription],
      ['meta[name="twitter:image"]', seo.ogImage],
    ];

    metaMap.forEach(([selector, value]) => {
      if (!value) return;
      const node = document.querySelector(selector);
      if (node) node.setAttribute("content", value);
    });
  }

  /* ─────────────────────────── Списки ─────────────────────────── */

  const renderers = {
    /* Навигация в шапке и мобильном меню */
    nav(container, content) {
      const items = content.header && content.header.nav;
      if (!Array.isArray(items)) return;
      const linkClass = container.getAttribute("data-cms-link-class") || "site-nav__link";
      container.textContent = "";
      items.forEach((item) => {
        container.appendChild(link(linkClass, item.label, item.href));
      });
    },

    /* Что я делаю */
    whatIDo(container, content) {
      const items = content.whatIDo && content.whatIDo.items;
      if (!Array.isArray(items)) return;
      const modifiers = {
        featured: "what-i-do__item--featured",
        wide: "what-i-do__item--wide",
        accent: "what-i-do__item--accent",
        dark: "what-i-do__item--featured what-i-do__item--dark",
      };
      container.textContent = "";
      items.forEach((item, index) => {
        const article = el("article", `what-i-do__item ${modifiers[item.size] || ""}`.trim());
        article.appendChild(el("span", "what-i-do__label", String(index + 1).padStart(2, "0")));
        article.appendChild(el("h3", "what-i-do__name", item.name));
        container.appendChild(article);
      });
    },

    /* Список «Знакомо?» */
    recognize(container, content) {
      const items = content.recognize && content.recognize.items;
      if (!Array.isArray(items)) return;
      container.textContent = "";
      items.forEach((item, index) => {
        const li = el("li", `recognize__item reveal${delayClass(index)}`);
        li.appendChild(icon(item.icon || "icon-help", "recognize__icon"));
        li.appendChild(el("span", null, item.text));
        container.appendChild(li);
      });
    },

    /* Задачи внутри блока «Что можно упростить» */
    simplifyTasks(container, content) {
      const zone = container.getAttribute("data-cms-zone");
      const tasks = content.simplify && content.simplify[zone] && content.simplify[zone].tasks;
      if (!Array.isArray(tasks)) return;
      container.textContent = "";
      tasks.forEach((task) => container.appendChild(el("span", "simplify__task", task)));
    },

    /* Три маршрута */
    routes(container, content) {
      const items = content.routes && content.routes.items;
      if (!Array.isArray(items)) return;
      container.textContent = "";
      items.forEach((item, index) => {
        const article = el(
          "article",
          `route-card${item.featured ? " route-card--featured" : ""}`
        );
        article.setAttribute("data-spotlight", "");
        article.setAttribute("data-tilt", "");
        article.appendChild(el("span", "route-card__number", String(index + 1).padStart(2, "0")));
        article.appendChild(el("h3", "route-card__title", item.title));
        article.appendChild(el("p", "route-card__text", item.text));
        if (item.btnLabel) {
          const action = el("div", "route-card__action");
          action.appendChild(
            link(`btn ${item.featured ? "btn--primary" : "btn--secondary"}`, item.btnLabel, item.btnHref)
          );
          article.appendChild(action);
        }
        container.appendChild(article);
      });
    },

    /* Проекты / инструменты */
    projects(container, content) {
      const items = (content.projects && content.projects.items) || [];
      const visible = items.filter(isVisible);
      container.textContent = "";

      visible.forEach((item, index) => {
        const article = el(
          "article",
          [
            "project-case",
            `project-case--${item.variant || "work"}`,
            index % 2 === 1 ? "project-case--reverse" : "",
            "reveal",
            "reveal--scale",
          ]
            .filter(Boolean)
            .join(" ")
        );
        article.setAttribute("data-spotlight", "");
        article.setAttribute("data-tilt", "");

        const contentCol = el("div", "project-case__content");
        contentCol.appendChild(el("span", "project-case__category", item.category));
        contentCol.appendChild(el("h3", "project-case__title", item.title));

        const meta = el("div", "project-case__meta");
        [
          ["Задача", item.task],
          ["Решение", item.solution],
        ].forEach(([label, text]) => {
          if (!text) return;
          const block = el("div", "project-case__block");
          block.appendChild(el("p", "project-case__block-label", label));
          block.appendChild(el("p", "project-case__block-text", text));
          meta.appendChild(block);
        });
        contentCol.appendChild(meta);

        if (Array.isArray(item.benefits) && item.benefits.length) {
          const list = el("ul", "project-case__benefits");
          item.benefits.forEach((benefit) =>
            list.appendChild(el("li", "project-case__benefit", benefit))
          );
          contentCol.appendChild(list);
        }

        if (Array.isArray(item.tags) && item.tags.length) {
          const tags = el("div", "project-case__features");
          item.tags.forEach((tag) => tags.appendChild(el("span", "tag", tag)));
          contentCol.appendChild(tags);
        }

        const actions = el("div", "project-case__actions");
        if (item.url) {
          actions.appendChild(
            link("btn btn--primary btn--shine", item.primaryLabel || "Открыть", item.url)
          );
        }
        if (item.github) {
          actions.appendChild(
            link("btn btn--secondary", item.githubLabel || "Посмотреть код на GitHub", item.github)
          );
        }
        contentCol.appendChild(actions);
        article.appendChild(contentCol);

        if (item.embedUrl) {
          const visual = el("div", "project-case__visual");
          const live = el("div", "project-live");

          const bar = el("div", "project-live__bar");
          bar.setAttribute("aria-hidden", "true");
          for (let i = 0; i < 3; i += 1) bar.appendChild(el("span", "project-live__dot"));
          bar.appendChild(
            el("span", "project-live__url", item.embedLabel || item.embedUrl.replace(/^https?:\/\//, ""))
          );
          live.appendChild(bar);

          const frame = document.createElement("iframe");
          frame.className = "project-live__frame";
          frame.src = item.embedUrl;
          frame.title = `${item.title} — живое приложение`;
          frame.loading = "lazy";
          frame.setAttribute("allow", "clipboard-write");
          live.appendChild(frame);

          const fallback = el("div", "project-live__fallback");
          fallback.appendChild(
            link("btn btn--secondary btn--sm", "Открыть в новой вкладке", item.embedUrl)
          );
          live.appendChild(fallback);

          visual.appendChild(live);
          article.appendChild(visual);
        }

        container.appendChild(article);
      });
    },

    /* Манифест «Быстро. Красиво. Точно.» */
    manifesto(container, content) {
      const lines = content.approach && content.approach.manifesto;
      if (!Array.isArray(lines)) return;
      const accentIndex = content.approach.accentIndex;
      container.textContent = "";
      lines.forEach((line, index) => {
        const classes = [
          "approach__line",
          index === accentIndex ? "approach__line--accent" : "",
          "reveal",
          index > 0 ? `reveal--delay-${Math.min(index, 3)}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        container.appendChild(el("p", classes, line));
      });
    },

    /* Шаги подхода */
    approachSteps(container, content) {
      const steps = content.approach && content.approach.steps;
      if (!Array.isArray(steps)) return;
      container.textContent = "";
      steps.forEach((step, index) => {
        const article = el("article", `approach-step reveal${delayClass(index)}`);
        article.appendChild(el("span", "approach-step__number", String(index + 1).padStart(2, "0")));
        article.appendChild(el("p", "approach-step__text", step));
        container.appendChild(article);
      });
    },

    /* Абзацы «Обо мне» */
    aboutText(container, content) {
      const paragraphs = content.about && content.about.paragraphs;
      if (!Array.isArray(paragraphs)) return;
      container.querySelectorAll(".about__text").forEach((node) => node.remove());
      const anchor = container.querySelector(".about__facts");
      paragraphs.forEach((text) => {
        const p = el("p", "about__text", text);
        if (anchor) container.insertBefore(p, anchor);
        else container.appendChild(p);
      });
    },

    aboutFacts(container, content) {
      const facts = content.about && content.about.facts;
      if (!Array.isArray(facts)) return;
      container.textContent = "";
      facts.forEach((fact) => container.appendChild(el("span", "about__fact", fact)));
    },

    /* Кейсы / первые результаты */
    cases(container, content) {
      const items = (content.cases && content.cases.items) || [];
      container.textContent = "";
      items.filter(isVisible).forEach((item, index) => {
        const article = el("article", `result-item reveal${delayClass(index)}`);
        article.appendChild(el("h3", "result-item__title", item.title));
        article.appendChild(el("p", "result-item__text", item.text));
        if (item.linkLabel && item.linkHref) {
          article.appendChild(link("result-item__link", item.linkLabel, item.linkHref));
        }
        container.appendChild(article);
      });
    },

    /* Отзывы — секция скрыта, пока нет опубликованных отзывов */
    testimonials(container, content) {
      const data = content.testimonials || {};
      const items = (data.items || []).filter(isVisible);
      const section = container.closest(".testimonials");
      container.textContent = "";

      if (!items.length) {
        if (section) section.hidden = true;
        return;
      }
      if (section) section.hidden = false;

      items.forEach((item, index) => {
        const article = el("article", `testimonial-card reveal${delayClass(index)}`);
        article.setAttribute("data-spotlight", "");
        article.appendChild(el("p", "testimonial-card__text", item.text));
        const author = el("div", "testimonial-card__author");
        author.appendChild(el("span", "testimonial-card__name", item.name));
        if (item.role) author.appendChild(el("span", "testimonial-card__role", item.role));
        article.appendChild(author);
        container.appendChild(article);
      });
    },

    /* Дорожная карта */
    roadmap(container, content) {
      const items = content.roadmap && content.roadmap.items;
      if (!Array.isArray(items)) return;
      const labels = { dev: "В разработке", planned: "Запланировано" };
      container.textContent = "";
      items.forEach((item, index) => {
        const article = el("article", `roadmap-card reveal${delayClass(index)}`);
        const status = item.status === "dev" ? "dev" : "planned";
        article.appendChild(
          el("span", `roadmap-card__status roadmap-card__status--${status}`, labels[status])
        );
        article.appendChild(el("h3", "roadmap-card__title", item.title));
        container.appendChild(article);
      });
    },

    /* FAQ */
    faq(container, content) {
      const items = (content.faq && content.faq.items) || [];
      container.textContent = "";
      items.filter(isVisible).forEach((item, index) => {
        const article = el("article", `faq-item reveal${delayClass(index)}`);

        const trigger = el("button", "faq-item__trigger");
        trigger.type = "button";
        trigger.setAttribute("aria-expanded", "false");
        trigger.appendChild(el("span", null, item.question));
        const iconSpan = el("span", "faq-item__icon");
        iconSpan.setAttribute("aria-hidden", "true");
        trigger.appendChild(iconSpan);
        article.appendChild(trigger);

        const panel = el("div", "faq-item__panel");
        panel.setAttribute("role", "region");
        const inner = el("div", "faq-item__panel-inner");
        inner.appendChild(el("p", "faq-item__answer", item.answer));
        panel.appendChild(inner);
        article.appendChild(panel);

        container.appendChild(article);
      });
    },

    /* Ссылки футера */
    footerLinks(container, content) {
      const links = content.footer && content.footer.links;
      if (!Array.isArray(links)) return;
      container.textContent = "";
      links.forEach((item) =>
        container.appendChild(link("site-footer__link", item.label, item.href))
      );
    },
  };

  /* ─────────────────────────── Hero ─────────────────────────── */

  function applyHero(hero) {
    const title = document.querySelector(".hero__title");
    if (!title || !hero) return;

    const accents = new Set(
      (hero.accentWords || []).map((word) => String(word).toLowerCase())
    );

    title.textContent = "";

    [hero.titleLine1, hero.titleLine2].forEach((lineText, lineIndex) => {
      if (!lineText) return;
      const line = el("span", "hero__title-line");
      String(lineText)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word, wordIndex) => {
          if (wordIndex > 0) line.appendChild(document.createTextNode(" "));
          const isAccent = accents.has(word.toLowerCase());
          const wordSpan = el("span", `hero__word${isAccent ? " hero__word--accent" : ""}`);
          wordSpan.appendChild(el("span", "hero__word-text", word));
          line.appendChild(wordSpan);
        });

      if (lineIndex === 0 && hero.showDash !== false) {
        const dash = el("span", "hero__title-dash", "\u00a0—");
        dash.setAttribute("aria-hidden", "true");
        line.appendChild(dash);
      }

      title.appendChild(line);
    });
  }

  /* ─────────────────────── Сборка и применение ─────────────────────── */

  function resolveContent() {
    const base = window.SITE_CONTENT || {};
    let content = deepMerge({}, base);

    const published = readStorage(STORAGE_PUBLISHED);
    if (published && published.content) {
      const fileTime = Date.parse(base.updatedAt || 0) || 0;
      const localTime = Date.parse(published.content.updatedAt || 0) || 0;
      if (localTime >= fileTime) content = deepMerge(content, published.content);
    }

    if (isPreviewMode()) {
      const draft = readStorage(STORAGE_DRAFT);
      if (draft && draft.content) content = deepMerge(content, draft.content);
    }

    return content;
  }

  function isPreviewMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("cms-preview") === "1") {
        window.sessionStorage.setItem("somnoilegko.cms.preview", "1");
        return true;
      }
      if (params.get("cms-preview") === "0") {
        window.sessionStorage.removeItem("somnoilegko.cms.preview");
        return false;
      }
      return window.sessionStorage.getItem("somnoilegko.cms.preview") === "1";
    } catch (error) {
      return false;
    }
  }

  function apply(content) {
    if (!content || !Object.keys(content).length) return;

    applySeo(content.seo);
    applyHero(content.hero);
    applyFields(document, content);

    document.querySelectorAll("[data-cms-list]").forEach((container) => {
      const name = container.getAttribute("data-cms-list");
      const renderer = renderers[name];
      if (!renderer) return;
      try {
        renderer(container, content);
      } catch (error) {
        console.warn(`[content-sync] Не удалось отрисовать список «${name}»`, error);
      }
    });

    if (isPreviewMode()) document.documentElement.classList.add("is-cms-preview");
  }

  const content = resolveContent();
  apply(content);

  window.CMS_CONTENT = content;
  window.CMS_SYNC = { apply, resolveContent, isPreviewMode };
})();
