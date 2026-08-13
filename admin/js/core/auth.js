/**
 * Авторизация панели управления.
 *
 * В серверном режиме сессия живёт в HttpOnly-cookie: JavaScript не имеет к ней
 * доступа, пароль проверяется на сервере.
 *
 * В локальном режиме пароль хранится как PBKDF2-хеш со случайной солью, сессия —
 * подписанный случайный токен с ограниченным сроком жизни. Есть защита от
 * перебора и автоматический выход при долгом бездействии.
 *
 * Учётные данные по умолчанию: admin / somnoilegko.
 * Панель настойчиво просит сменить их до начала работы.
 */

window.Admin = window.Admin || {};

Admin.Auth = (function () {
  "use strict";

  const KEY_CREDENTIALS = "somnoilegko.admin.credentials";
  const KEY_SESSION = "somnoilegko.admin.session";
  const KEY_ATTEMPTS = "somnoilegko.admin.attempts";

  const DEFAULT_LOGIN = "admin";
  const DEFAULT_PASSWORD = "somnoilegko";

  const TTL_REMEMBER = 30 * 24 * 60 * 60 * 1000;
  const TTL_SESSION = 12 * 60 * 60 * 1000;
  const IDLE_LIMIT = 90 * 60 * 1000;

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 30 * 1000;

  let mode = "local";
  let currentUser = null;
  let usesDefaultPassword = false;
  let idleTimer = 0;
  const idleHandlers = new Set();

  /* ───────────────────── Служебное ───────────────────── */

  function read(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("[auth] Не удалось записать данные сессии", error);
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(KEY_SESSION);
      window.sessionStorage.removeItem(KEY_SESSION);
    } catch (error) {
      /* хранилище недоступно — нечего чистить */
    }
  }

  function readSession() {
    return (
      read(window.localStorage, KEY_SESSION, null) ||
      read(window.sessionStorage, KEY_SESSION, null)
    );
  }

  /* ───────────────────── Локальные учётные данные ───────────────────── */

  async function ensureCredentials() {
    let record = read(window.localStorage, KEY_CREDENTIALS, null);
    if (record && record.hash && record.salt) return record;

    const hashed = await Admin.Crypto.hashPassword(DEFAULT_PASSWORD);
    record = {
      login: DEFAULT_LOGIN,
      ...hashed,
      isDefault: true,
      updatedAt: new Date().toISOString(),
    };
    write(window.localStorage, KEY_CREDENTIALS, record);
    return record;
  }

  function getAttempts() {
    const record = read(window.localStorage, KEY_ATTEMPTS, { count: 0, until: 0 });
    if (record.until && record.until < Date.now()) return { count: 0, until: 0 };
    return record;
  }

  function registerFailure() {
    const record = getAttempts();
    const count = record.count + 1;
    const until = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
    write(window.localStorage, KEY_ATTEMPTS, { count: until ? 0 : count, until });
    return until;
  }

  function resetAttempts() {
    write(window.localStorage, KEY_ATTEMPTS, { count: 0, until: 0 });
  }

  /* ───────────────────── Бездействие ───────────────────── */

  function touchIdle() {
    if (!currentUser) return;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      idleHandlers.forEach((handler) => handler());
    }, IDLE_LIMIT);

    const session = readSession();
    if (session && mode === "local") {
      session.lastActivity = Date.now();
      const storage = session.remember ? window.localStorage : window.sessionStorage;
      write(storage, KEY_SESSION, session);
    }
  }

  function watchActivity() {
    ["click", "keydown", "pointerdown", "visibilitychange"].forEach((event) => {
      document.addEventListener(event, touchIdle, { passive: true });
    });
  }

  /* ───────────────────── Публичные операции ───────────────────── */

  async function init(detectedMode) {
    mode = detectedMode;

    if (mode === "local") {
      const record = await ensureCredentials();
      usesDefaultPassword = Boolean(record.isDefault);
    }

    watchActivity();
    return restore();
  }

  async function restore() {
    if (mode === "server") {
      try {
        const result = await Admin.Api.get("/auth/session");
        if (result && result.user) {
          currentUser = result.user;
          usesDefaultPassword = Boolean(result.usesDefaultPassword);
          touchIdle();
          return currentUser;
        }
      } catch (error) {
        /* нет активной сессии */
      }
      currentUser = null;
      return null;
    }

    const session = readSession();
    if (!session || !session.token) return null;

    const expired = session.expiresAt && session.expiresAt < Date.now();
    const idle =
      session.lastActivity && Date.now() - session.lastActivity > IDLE_LIMIT;

    if (expired || idle) {
      clearSession();
      return null;
    }

    currentUser = { login: session.login };
    touchIdle();
    return currentUser;
  }

  async function login(loginValue, password, remember) {
    if (mode === "server") {
      const result = await Admin.Api.post("/auth/login", {
        login: loginValue,
        password,
        remember: Boolean(remember),
      });
      currentUser = result.user;
      usesDefaultPassword = Boolean(result.usesDefaultPassword);
      touchIdle();
      return currentUser;
    }

    const attempts = getAttempts();
    if (attempts.until && attempts.until > Date.now()) {
      const seconds = Math.ceil((attempts.until - Date.now()) / 1000);
      throw new Error(`Слишком много попыток. Повторите через ${seconds} с.`);
    }

    const record = await ensureCredentials();
    const loginMatches = Admin.Crypto.timingSafeEqual(
      String(loginValue || "").trim().toLowerCase(),
      String(record.login).toLowerCase()
    );
    const passwordMatches = await Admin.Crypto.verifyPassword(password, record);

    if (!loginMatches || !passwordMatches) {
      const until = registerFailure();
      if (until) throw new Error("Слишком много попыток. Повторите через 30 с.");
      throw new Error("Неверный логин или пароль");
    }

    resetAttempts();

    const ttl = remember ? TTL_REMEMBER : TTL_SESSION;
    const session = {
      token: Admin.Crypto.randomToken(32),
      login: record.login,
      remember: Boolean(remember),
      issuedAt: Date.now(),
      lastActivity: Date.now(),
      expiresAt: Date.now() + ttl,
    };

    clearSession();
    write(remember ? window.localStorage : window.sessionStorage, KEY_SESSION, session);

    currentUser = { login: record.login };
    usesDefaultPassword = Boolean(record.isDefault);
    touchIdle();
    return currentUser;
  }

  async function logout() {
    window.clearTimeout(idleTimer);
    currentUser = null;

    if (mode === "server") {
      try {
        await Admin.Api.post("/auth/logout", {});
      } catch (error) {
        /* даже при ошибке сети локально считаем себя вышедшими */
      }
    }
    clearSession();
  }

  async function changePassword(currentPassword, nextPassword, nextLogin) {
    if (String(nextPassword || "").length < 8) {
      throw new Error("Пароль должен быть не короче 8 символов");
    }

    // Возврат к паролю из коробки не считается сменой: предупреждение остаётся.
    const backToDefault = nextPassword === DEFAULT_PASSWORD;

    if (mode === "server") {
      await Admin.Api.post("/auth/password", {
        current: currentPassword,
        next: nextPassword,
        login: nextLogin || undefined,
      });
      usesDefaultPassword = backToDefault;
      return true;
    }

    const record = await ensureCredentials();
    const valid = await Admin.Crypto.verifyPassword(currentPassword, record);
    if (!valid) throw new Error("Текущий пароль указан неверно");

    const hashed = await Admin.Crypto.hashPassword(nextPassword);
    const updated = {
      login: String(nextLogin || record.login).trim() || record.login,
      ...hashed,
      isDefault: backToDefault,
      updatedAt: new Date().toISOString(),
    };
    write(window.localStorage, KEY_CREDENTIALS, updated);

    usesDefaultPassword = backToDefault;
    currentUser = { login: updated.login };
    return true;
  }

  function onIdle(handler) {
    idleHandlers.add(handler);
    return () => idleHandlers.delete(handler);
  }

  return {
    DEFAULT_LOGIN,
    DEFAULT_PASSWORD,
    init,
    restore,
    login,
    logout,
    changePassword,
    onIdle,
    touchIdle,
    get user() {
      return currentUser;
    },
    get mode() {
      return mode;
    },
    get usesDefaultPassword() {
      return usesDefaultPassword;
    },
  };
})();
