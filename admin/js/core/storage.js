/**
 * Хранилище панели управления.
 *
 * Один интерфейс — два адаптера:
 *   ServerAdapter — читает и пишет через REST API (server/app.py);
 *   LocalAdapter  — читает и пишет localStorage браузера.
 *
 * Черновик всегда дублируется в localStorage: благодаря этому предпросмотр
 * сайта показывает несохранённые правки в обоих режимах.
 */

window.Admin = window.Admin || {};

Admin.Store = (function () {
  "use strict";

  const S = Admin.Schema;

  const KEYS = {
    draft: "somnoilegko.cms.draft",
    published: "somnoilegko.cms.published",
    telegram: "somnoilegko.admin.telegram",
    brandOs: "somnoilegko.admin.brandos",
    ai: "somnoilegko.admin.ai",
    apps: "somnoilegko.admin.apps",
  };

  const MODULES = ["telegram", "brandOs", "ai", "apps"];

  const state = {
    mode: "local",
    content: {},
    published: {},
    telegram: S.defaultTelegram(),
    brandOs: S.defaultBrandOs(),
    ai: S.defaultAi(),
    apps: S.defaultApps(),
    dirty: false,
    saving: false,
    lastSavedAt: null,
    lastPublishedAt: null,
  };

  const listeners = new Set();
  let autosaveTimer = 0;

  /* ───────────────────── Локальное хранилище ───────────────────── */

  function readLocal(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`[store] Не удалось прочитать «${key}»`, error);
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`[store] Не удалось сохранить «${key}»`, error);
      return false;
    }
  }

  /* ───────────────────── Адаптеры ───────────────────── */

  const LocalAdapter = {
    name: "local",

    async load() {
      const base = S.defaultContent();
      const publishedRecord = readLocal(KEYS.published, null);
      const draftRecord = readLocal(KEYS.draft, null);

      const published = publishedRecord && publishedRecord.content
        ? S.merge(base, publishedRecord.content)
        : base;
      const content = draftRecord && draftRecord.content
        ? S.merge(published, draftRecord.content)
        : S.clone(published);

      return {
        content,
        published,
        telegram: S.merge(S.defaultTelegram(), readLocal(KEYS.telegram, {})),
        brandOs: S.merge(S.defaultBrandOs(), readLocal(KEYS.brandOs, {})),
        ai: S.merge(S.defaultAi(), readLocal(KEYS.ai, {})),
        apps: mergeApps(readLocal(KEYS.apps, null)),
      };
    },

    async saveDraft(content) {
      writeLocal(KEYS.draft, { content, updatedAt: new Date().toISOString() });
    },

    async publish(content) {
      writeLocal(KEYS.published, { content, updatedAt: content.updatedAt });
      writeLocal(KEYS.draft, { content, updatedAt: content.updatedAt });
      return { ok: true, written: false };
    },

    async saveModule(name, data) {
      writeLocal(KEYS[name], data);
    },
  };

  const ServerAdapter = {
    name: "server",

    async load() {
      const payload = await Admin.Api.get("/state");
      const base = S.defaultContent();
      const published = S.merge(base, payload.published || {});
      const content = S.merge(published, payload.content || {});

      return {
        content,
        published,
        telegram: S.merge(S.defaultTelegram(), payload.telegram || {}),
        brandOs: S.merge(S.defaultBrandOs(), payload.brandOs || {}),
        ai: S.merge(S.defaultAi(), payload.ai || {}),
        apps: mergeApps(payload.apps),
      };
    },

    async saveDraft(content) {
      writeLocal(KEYS.draft, { content, updatedAt: new Date().toISOString() });
      await Admin.Api.put("/state/content", { data: content });
    },

    async publish(content) {
      writeLocal(KEYS.published, { content, updatedAt: content.updatedAt });
      writeLocal(KEYS.draft, { content, updatedAt: content.updatedAt });
      const result = await Admin.Api.post("/publish", { data: content });
      return { ok: true, written: Boolean(result && result.written) };
    },

    async saveModule(name, data) {
      writeLocal(KEYS[name], data);
      await Admin.Api.put(`/state/${name}`, { data });
    },
  };

  let adapter = LocalAdapter;

  /** Встроенное приложение «Время» не должно потеряться при обновлении. */
  function mergeApps(saved) {
    const defaults = S.defaultApps();
    if (!saved || !Array.isArray(saved.apps)) return defaults;

    const byId = new Map(saved.apps.map((app) => [app.id, app]));
    defaults.apps.forEach((builtin) => {
      if (!byId.has(builtin.id)) byId.set(builtin.id, builtin);
      else byId.set(builtin.id, { ...builtin, ...byId.get(builtin.id), builtin: true });
    });

    return { ...saved, apps: [...byId.values()] };
  }

  /* ───────────────────── Подписки ───────────────────── */

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(event) {
    listeners.forEach((listener) => {
      try {
        listener(event, state);
      } catch (error) {
        console.error("[store] Ошибка в подписчике", error);
      }
    });
  }

  /* ───────────────────── Жизненный цикл ───────────────────── */

  async function init(mode) {
    adapter = mode === "server" ? ServerAdapter : LocalAdapter;
    state.mode = adapter.name;

    const data = await adapter.load();
    Object.assign(state, data);
    state.dirty = hasDraftChanges();
    emit("loaded");
    return state;
  }

  function hasDraftChanges() {
    return JSON.stringify(stripMeta(state.content)) !== JSON.stringify(stripMeta(state.published));
  }

  function stripMeta(content) {
    const copy = S.clone(content || {});
    delete copy.updatedAt;
    return copy;
  }

  /* ───────────────────── Контент ───────────────────── */

  function getContent() {
    return state.content;
  }

  /**
   * Точечное изменение поля контента по пути «hero.titleLine1».
   * Возвращает true, если значение действительно изменилось.
   */
  function setField(path, value) {
    const keys = String(path).split(".");
    let node = state.content;

    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i];
      if (!S.isPlainObject(node[key]) && !Array.isArray(node[key])) node[key] = {};
      node = node[key];
    }

    const last = keys[keys.length - 1];
    if (JSON.stringify(node[last]) === JSON.stringify(value)) return false;

    node[last] = value;
    markDirty();
    return true;
  }

  function getField(path, fallback) {
    const value = String(path)
      .split(".")
      .reduce((acc, key) => (acc == null ? undefined : acc[key]), state.content);
    return value === undefined ? fallback : value;
  }

  function markDirty() {
    state.dirty = true;
    emit("dirty");
    scheduleAutosave();
  }

  function scheduleAutosave() {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      saveDraft().catch((error) => console.warn("[store] Автосохранение не удалось", error));
    }, 900);
  }

  async function saveDraft() {
    if (state.saving) return;
    state.saving = true;
    emit("saving");
    try {
      await adapter.saveDraft(state.content);
      state.lastSavedAt = new Date().toISOString();
      emit("saved");
    } finally {
      state.saving = false;
    }
  }

  async function publish() {
    window.clearTimeout(autosaveTimer);
    state.saving = true;
    emit("saving");
    try {
      state.content.updatedAt = new Date().toISOString();
      const result = await adapter.publish(state.content);
      state.published = S.clone(state.content);
      state.dirty = false;
      state.lastPublishedAt = state.content.updatedAt;
      emit("published");
      return result;
    } finally {
      state.saving = false;
    }
  }

  /** Откат черновика к последней публикации. */
  async function discardDraft() {
    state.content = S.clone(state.published);
    state.dirty = false;
    await adapter.saveDraft(state.content);
    emit("reverted");
  }

  /* ───────────────────── Модули ───────────────────── */

  function getModule(name) {
    return state[name];
  }

  const moduleTimers = {};

  /** Отложенное сохранение модуля — чтобы не писать хранилище на каждый символ. */
  function saveModuleSoon(name, delay) {
    window.clearTimeout(moduleTimers[name]);
    moduleTimers[name] = window.setTimeout(() => {
      saveModule(name).catch((error) =>
        console.warn(`[store] Не удалось сохранить модуль «${name}»`, error)
      );
    }, delay || 800);
  }

  async function saveModule(name) {
    if (!MODULES.includes(name)) throw new Error(`Неизвестный модуль: ${name}`);
    state.saving = true;
    emit("saving");
    try {
      await adapter.saveModule(name, state[name]);
      state.lastSavedAt = new Date().toISOString();
      emit("saved");
    } finally {
      state.saving = false;
    }
  }

  /* ───────────────────── Экспорт файла контента ───────────────────── */

  /** Готовит содержимое data/content.js — для ручной публикации без сервера. */
  function buildContentFile(content) {
    const json = JSON.stringify(content || state.content, null, 2);
    return [
      "/**",
      " * Контент сайта «Сомной_легко»",
      " *",
      " * Файл сформирован административной панелью. Вручную не редактируйте:",
      " * изменения будут перезаписаны при следующей публикации.",
      " */",
      "",
      `const SITE_CONTENT = ${json};`,
      "",
      "if (typeof window !== \"undefined\") {",
      "  window.SITE_CONTENT = SITE_CONTENT;",
      "}",
      "",
    ].join("\n");
  }

  function downloadContentFile() {
    const blob = new Blob([buildContentFile()], {
      type: "application/javascript;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "content.js";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    KEYS,
    state,
    init,
    subscribe,
    emit,
    getContent,
    getField,
    setField,
    markDirty,
    saveDraft,
    publish,
    discardDraft,
    getModule,
    saveModule,
    saveModuleSoon,
    buildContentFile,
    downloadContentFile,
    hasDraftChanges,
  };
})();
