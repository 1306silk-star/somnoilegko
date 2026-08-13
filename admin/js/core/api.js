/**
 * Клиент серверного API панели управления.
 *
 * Панель работает в двух режимах:
 *   • «сервер»  — если рядом запущен server/app.py: авторизация по HttpOnly-cookie,
 *                 данные и публикация в Telegram выполняются на сервере;
 *   • «локально» — если сервера нет (например, GitHub Pages): данные лежат
 *                 в localStorage браузера владельца.
 *
 * Режим определяется один раз при загрузке запросом к /api/health.
 */

window.Admin = window.Admin || {};

Admin.Api = (function () {
  "use strict";

  const BASE = "/api";
  const TIMEOUT = 12000;

  let available = false;
  let info = null;

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.payload = payload || null;
    }
  }

  async function request(path, options) {
    const opts = options || {};
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), opts.timeout || TIMEOUT);

    try {
      const response = await fetch(BASE + path, {
        method: opts.method || "GET",
        headers: opts.body
          ? { "Content-Type": "application/json", ...(opts.headers || {}) }
          : opts.headers || {},
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          payload = { raw: text };
        }
      }

      if (!response.ok) {
        const message =
          (payload && (payload.error || payload.message)) ||
          `Сервер ответил ошибкой ${response.status}`;
        throw new ApiError(message, response.status, payload);
      }

      return payload;
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** Однократная проверка: есть ли рядом работающий сервер панели. */
  async function probe() {
    if (window.location.protocol === "file:") {
      available = false;
      return false;
    }
    try {
      const result = await request("/health", { timeout: 3500 });
      available = Boolean(result && result.ok);
      info = result || null;
    } catch (error) {
      available = false;
      info = null;
    }
    return available;
  }

  return {
    ApiError,
    request,
    probe,
    get available() {
      return available;
    },
    get info() {
      return info;
    },
    get: (path) => request(path),
    post: (path, body) => request(path, { method: "POST", body }),
    put: (path, body) => request(path, { method: "PUT", body }),
    del: (path) => request(path, { method: "DELETE" }),
  };
})();
