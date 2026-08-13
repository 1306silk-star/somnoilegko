/**
 * Хеш-роутер панели.
 *
 * Адреса вида #/telegram/compose работают на любом хостинге, включая GitHub Pages,
 * потому что не требуют серверной обработки путей.
 */

window.Admin = window.Admin || {};

Admin.Router = (function () {
  "use strict";

  const routes = new Map();
  const groups = [];
  let currentRoute = null;
  let onChange = null;

  /**
   * @param {object} route
   * @param {string} route.id       — путь без «#/», например «telegram»
   * @param {string} route.title    — заголовок в шапке
   * @param {string} route.eyebrow  — надзаголовок
   * @param {string} route.nav      — подпись в боковом меню (если раздел в меню)
   * @param {string} route.group    — группа бокового меню
   * @param {Function} route.render — возвращает DOM-узел раздела
   */
  function register(route) {
    routes.set(route.id, route);
    if (route.nav) {
      let group = groups.find((item) => item.title === route.group);
      if (!group) {
        group = { title: route.group || "", items: [] };
        groups.push(group);
      }
      group.items.push(route);
    }
  }

  function getGroups() {
    return groups;
  }

  function parseHash() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    const [path, query] = raw.split("?");
    const segments = path.split("/").filter(Boolean);
    return {
      id: segments[0] || "dashboard",
      params: segments.slice(1),
      query: new URLSearchParams(query || ""),
    };
  }

  function resolve() {
    const parsed = parseHash();
    const route = routes.get(parsed.id) || routes.get("dashboard");
    currentRoute = route;
    return { route, params: parsed.params, query: parsed.query };
  }

  function navigate(path, replace) {
    const target = `#/${String(path).replace(/^#?\/?/, "")}`;
    if (window.location.hash === target) {
      if (onChange) onChange(resolve());
      return;
    }
    if (replace) window.location.replace(target);
    else window.location.hash = target;
  }

  function start(handler) {
    onChange = handler;
    window.addEventListener("hashchange", () => handler(resolve()));
    if (!window.location.hash) window.location.replace("#/dashboard");
    handler(resolve());
  }

  return {
    register,
    getGroups,
    resolve,
    navigate,
    start,
    get current() {
      return currentRoute;
    },
  };
})();
