#!/usr/bin/env python3
"""
Сервер панели управления «Сомной_легко».

Одновременно отдаёт статический сайт, административную панель и REST API.
Используется только стандартная библиотека Python — устанавливать ничего не нужно.

Запуск из корня проекта:

    python server/app.py

После запуска:
    сайт   — http://localhost:8787/
    панель — http://localhost:8787/admin

Что делает сервер:
  • хранит контент, публикации и настройки в server/data/*.json;
  • при публикации переписывает data/content.js, который читает сайт;
  • проверяет пароль администратора (PBKDF2-HMAC-SHA256) и выдаёт HttpOnly-сессию;
  • отправляет публикации в Telegram и следит за отложенными по расписанию.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ──────────────────────────── Пути и константы ────────────────────────────

SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
SITE_DATA_DIR = ROOT_DIR / "data"

# Настройки и данные можно вынести из папки проекта: на хостинге каталог
# приложения часто только для чтения, а конфигурацию монтируют отдельно.
CONFIG_PATH = Path(os.environ.get("ADMIN_CONFIG") or (SERVER_DIR / "config.json"))
DATA_DIR = Path(os.environ.get("ADMIN_DATA") or (SERVER_DIR / "data"))

DEFAULT_LOGIN = "admin"
DEFAULT_PASSWORD = "somnoilegko"

PBKDF2_ITERATIONS = 210_000
SESSION_COOKIE = "somnoilegko_admin"
SESSION_TTL_SHORT = 12 * 60 * 60
SESSION_TTL_LONG = 30 * 24 * 60 * 60

MAX_BODY_BYTES = 4 * 1024 * 1024
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 60

MODULE_FILES = {
    "content": "content.json",
    "published": "published.json",
    "telegram": "telegram.json",
    "brandOs": "brandos.json",
    "ai": "ai.json",
    "apps": "apps.json",
}

STORE_LOCK = threading.Lock()
SESSIONS: dict[str, dict] = {}
LOGIN_ATTEMPTS: dict[str, dict] = {}


# ──────────────────────────── Вспомогательное ────────────────────────────


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(message: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


class ConfigError(Exception):
    """Настройки существуют, но прочитать их не удалось."""


def read_json(path: Path, fallback, strict: bool = False):
    """Читает JSON, прощая BOM: его добавляют Блокнот и PowerShell.

    Со strict=True ошибка чтения не заменяется значением по умолчанию: файл
    с паролем и токенами нельзя молча перезаписать.
    """
    try:
        with path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return fallback
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as error:
        if strict:
            raise ConfigError(f"{path}: {error}") from error
        log(f"Не удалось прочитать {path.name}: {error}")
        return fallback


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    temporary.replace(path)


# ──────────────────────────── Конфигурация ────────────────────────────


DEFAULT_CONFIG = {
    "host": "127.0.0.1",
    "port": 8787,
    # На хостинге сервер обычно стоит за обратным прокси: тогда включите,
    # чтобы адрес клиента и признак HTTPS читались из заголовков прокси.
    "trustProxy": False,
    # Пометить сессионную куку Secure, даже если признак HTTPS недоступен.
    "forceSecureCookie": False,
    "telegram": {
        # Токен бота от @BotFather. Оставьте пустым — панель честно скажет,
        # что отправка недоступна, и продолжит работать с черновиками.
        "botToken": "",
        # Канал: @somnoi_legko или числовой идентификатор приватного чата.
        "chatId": "",
        "parseMode": "HTML",
    },
    "auth": {
        "login": DEFAULT_LOGIN,
        # Заполняется автоматически при первом запуске.
        "passwordHash": "",
        "passwordSalt": "",
        "iterations": PBKDF2_ITERATIONS,
        "isDefault": True,
    },
}


def load_config() -> dict:
    config = read_json(CONFIG_PATH, {}, strict=True)
    merged = json.loads(json.dumps(DEFAULT_CONFIG))

    for key, value in (config or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value

    if not merged["auth"].get("passwordHash"):
        salt = secrets.token_hex(16)
        merged["auth"]["passwordSalt"] = salt
        merged["auth"]["passwordHash"] = derive_password(DEFAULT_PASSWORD, salt, PBKDF2_ITERATIONS)
        merged["auth"]["iterations"] = PBKDF2_ITERATIONS
        merged["auth"]["isDefault"] = True
        write_json(CONFIG_PATH, merged)
        log("Создан server/config.json с паролем по умолчанию — смените его в панели")

    return merged


def save_config(config: dict) -> None:
    write_json(CONFIG_PATH, config)


# ──────────────────────────── Пароли и сессии ────────────────────────────


def derive_password(password: str, salt: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations
    ).hex()


def verify_password(password: str, auth: dict) -> bool:
    if not auth.get("passwordHash") or not auth.get("passwordSalt"):
        return False
    candidate = derive_password(
        password, auth["passwordSalt"], int(auth.get("iterations", PBKDF2_ITERATIONS))
    )
    return hmac.compare_digest(candidate, auth["passwordHash"])


def create_session(login: str, remember: bool) -> tuple[str, int]:
    token = secrets.token_urlsafe(32)
    ttl = SESSION_TTL_LONG if remember else SESSION_TTL_SHORT
    SESSIONS[token] = {
        "login": login,
        "expiresAt": time.time() + ttl,
        "createdAt": now_iso(),
    }
    persist_sessions()
    return token, ttl


def persist_sessions() -> None:
    alive = {
        token: session
        for token, session in SESSIONS.items()
        if session["expiresAt"] > time.time()
    }
    SESSIONS.clear()
    SESSIONS.update(alive)
    write_json(DATA_DIR / "sessions.json", alive)


def restore_sessions() -> None:
    stored = read_json(DATA_DIR / "sessions.json", {})
    for token, session in (stored or {}).items():
        if session.get("expiresAt", 0) > time.time():
            SESSIONS[token] = session


def get_session(token: str | None) -> dict | None:
    if not token:
        return None
    session = SESSIONS.get(token)
    if not session:
        return None
    if session["expiresAt"] < time.time():
        SESSIONS.pop(token, None)
        return None
    return session


def check_lockout(ip: str) -> int:
    record = LOGIN_ATTEMPTS.get(ip)
    if not record:
        return 0
    if record.get("until", 0) > time.time():
        return int(record["until"] - time.time())
    return 0


def register_failure(ip: str) -> None:
    record = LOGIN_ATTEMPTS.setdefault(ip, {"count": 0, "until": 0})
    record["count"] += 1
    if record["count"] >= LOGIN_MAX_ATTEMPTS:
        record["count"] = 0
        record["until"] = time.time() + LOGIN_LOCKOUT_SECONDS


def reset_failures(ip: str) -> None:
    LOGIN_ATTEMPTS.pop(ip, None)


# Конфигурация читается после объявления функций хеширования: при первом запуске
# ей нужно создать хеш пароля по умолчанию.
try:
    CONFIG = load_config()
except ConfigError as error:
    log(f"Настройки не читаются — {error}")
    log("Файл хранит пароль и токены, поэтому сервер не будет его перезаписывать.")
    log("Исправьте JSON (частая причина — BOM или лишняя запятая) и запустите снова.")
    raise SystemExit(1) from None


# ──────────────────────────── Хранилище ────────────────────────────


def module_path(name: str) -> Path:
    return DATA_DIR / MODULE_FILES[name]


def load_module(name: str, fallback=None):
    return read_json(module_path(name), fallback if fallback is not None else {})


def save_module(name: str, payload) -> None:
    with STORE_LOCK:
        write_json(module_path(name), payload)


def extract_content_object(raw: str) -> dict:
    """Достаёт объект SITE_CONTENT из data/content.js.

    Файл — обычный JS, поэтому ищем начало литерала и идём по символам,
    считая вложенность и пропуская содержимое строк.
    """
    marker = raw.find("SITE_CONTENT")
    if marker == -1:
        return {}

    start = raw.find("{", marker)
    if start == -1:
        return {}

    depth = 0
    in_string: str | None = None
    escaped = False

    for index in range(start, len(raw)):
        char = raw[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue

        if char in ('"', "'", "`"):
            in_string = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return json.loads(raw[start : index + 1])

    return {}


def build_content_file(content: dict) -> str:
    body = json.dumps(content, ensure_ascii=False, indent=2)
    return (
        "/**\n"
        " * Контент сайта «Сомной_легко»\n"
        " *\n"
        " * Файл сформирован административной панелью. Вручную не редактируйте:\n"
        " * изменения будут перезаписаны при следующей публикации.\n"
        " */\n"
        "\n"
        f"const SITE_CONTENT = {body};\n"
        "\n"
        'if (typeof window !== "undefined") {\n'
        "  window.SITE_CONTENT = SITE_CONTENT;\n"
        "}\n"
    )


def publish_content(content: dict) -> bool:
    """Пишет контент в data/content.js — файл, который читает сайт."""
    with STORE_LOCK:
        SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
        target = SITE_DATA_DIR / "content.js"
        backup = SITE_DATA_DIR / "content.backup.js"

        if target.exists():
            backup.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")

        target.write_text(build_content_file(content), encoding="utf-8")
        write_json(module_path("published"), content)
        write_json(module_path("content"), content)

    log("Контент опубликован в data/content.js")
    return True


# ──────────────────────────── Telegram ────────────────────────────


def telegram_request(method: str, payload: dict) -> dict:
    token = CONFIG["telegram"].get("botToken", "").strip()
    if not token:
        # Это не сбой Telegram, а незаполненная настройка — отвечаем 400.
        raise ValueError(
            "Токен бота не указан. Впишите его в server/config.json → telegram.botToken"
        )

    url = f"https://api.telegram.org/bot{token}/{method}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            raise RuntimeError(parsed.get("description", detail)) from error
        except json.JSONDecodeError:
            raise RuntimeError(f"Telegram ответил ошибкой {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Нет связи с Telegram: {error.reason}") from error

    if not result.get("ok"):
        raise RuntimeError(result.get("description", "Telegram отклонил запрос"))

    return result.get("result", {})


def telegram_send(post: dict) -> dict:
    chat_id = (post.get("chatId") or CONFIG["telegram"].get("chatId") or "").strip()
    if not chat_id:
        raise ValueError("Не указан канал для публикации")

    parse_mode = post.get("parseMode", CONFIG["telegram"].get("parseMode", "HTML"))
    text = post.get("text", "")
    image = (post.get("imageUrl") or "").strip()

    if image:
        payload = {
            "chat_id": chat_id,
            "photo": image,
            "caption": text,
            "disable_notification": bool(post.get("silent")),
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        result = telegram_request("sendPhoto", payload)
    else:
        payload = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": bool(post.get("disablePreview")),
            "disable_notification": bool(post.get("silent")),
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        result = telegram_request("sendMessage", payload)

    return {"messageId": result.get("message_id")}


def scheduler_loop() -> None:
    """Фоновая проверка отложенных публикаций — раз в 30 секунд."""
    while True:
        time.sleep(30)
        try:
            state = load_module("telegram", {})
            posts = state.get("posts") or []
            settings = state.get("settings") or {}
            changed = False
            now = datetime.now(timezone.utc)

            for post in posts:
                if post.get("status") != "scheduled" or not post.get("scheduledAt"):
                    continue
                try:
                    due = datetime.fromisoformat(str(post["scheduledAt"]).replace("Z", "+00:00"))
                except ValueError:
                    continue
                if due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)
                if due > now:
                    continue

                try:
                    result = telegram_send(
                        {
                            "text": post.get("text", ""),
                            "imageUrl": post.get("imageUrl", ""),
                            "chatId": settings.get("chatId"),
                            "parseMode": settings.get("parseMode"),
                            "disablePreview": not post.get("linkPreview", True),
                            "silent": post.get("silent"),
                        }
                    )
                    post["status"] = "sent"
                    post["publishedAt"] = now_iso()
                    post["messageId"] = result.get("messageId")
                    post["error"] = ""
                    log(f"Отложенная публикация отправлена: {post.get('title') or post['id']}")
                except Exception as error:  # noqa: BLE001 — показываем причину владельцу
                    post["status"] = "error"
                    post["error"] = str(error)
                    log(f"Отложенная публикация не ушла: {error}")

                post["updatedAt"] = now_iso()
                changed = True

            if changed:
                state["posts"] = posts
                save_module("telegram", state)
        except Exception as error:  # noqa: BLE001 — планировщик не должен падать
            log(f"Планировщик: непредвиденная ошибка — {error}")


# ──────────────────────────── HTTP ────────────────────────────


class Handler(BaseHTTPRequestHandler):
    server_version = "SomnoiLegkoAdmin/1.0"
    protocol_version = "HTTP/1.1"

    # ── ответы ──

    def send_json(self, payload, status: int = 200, cookie: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message: str, status: int = 400) -> None:
        self.send_json({"error": message}, status=status)

    # ── чтение запроса ──

    def consume_body(self) -> None:
        """Вычитывает тело запроса целиком.

        Соединение живёт по HTTP/1.1, поэтому непрочитанные байты тела сервер
        принял бы за начало следующего запроса и ответил бы 501.
        """
        self._body_raw = b""
        self._body_too_large = False

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return

        remaining = length
        chunks = []
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)
            if length <= MAX_BODY_BYTES:
                chunks.append(chunk)

        if length > MAX_BODY_BYTES:
            self._body_too_large = True
        else:
            self._body_raw = b"".join(chunks)

    def read_body(self) -> dict:
        if getattr(self, "_body_too_large", False):
            raise ValueError("Слишком большой запрос")

        raw = getattr(self, "_body_raw", b"")
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("Тело запроса не является корректным JSON") from error

    def get_cookie(self, name: str) -> str | None:
        header = self.headers.get("Cookie")
        if not header:
            return None
        for chunk in header.split(";"):
            key, _, value = chunk.strip().partition("=")
            if key == name:
                return value
        return None

    def current_session(self) -> dict | None:
        return get_session(self.get_cookie(SESSION_COOKIE))

    def require_session(self) -> dict | None:
        session = self.current_session()
        if not session:
            self.send_error_json("Требуется вход в панель", 401)
            return None
        return session

    def client_ip(self) -> str:
        # За обратным прокси все запросы приходят с одного адреса, поэтому
        # без разбора X-Forwarded-For блокировка перебора закрыла бы вход всем.
        if CONFIG.get("trustProxy"):
            forwarded = self.headers.get("X-Forwarded-For")
            if forwarded:
                first = forwarded.split(",")[0].strip()
                if first:
                    return first
        return self.client_address[0] if self.client_address else "unknown"

    def is_secure(self) -> bool:
        """HTTPS обычно завершается на прокси, поэтому смотрим и заголовок."""
        if CONFIG.get("trustProxy"):
            proto = (self.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip()
            if proto:
                return proto.lower() == "https"
        return bool(CONFIG.get("forceSecureCookie"))

    def session_cookie(self, token: str, max_age: int) -> str:
        parts = [
            f"{SESSION_COOKIE}={token}",
            "Path=/",
            "HttpOnly",
            "SameSite=Strict",
            f"Max-Age={max_age}",
        ]
        if self.is_secure():
            parts.append("Secure")
        return "; ".join(parts)

    # ── маршрутизация ──

    def do_GET(self) -> None:  # noqa: N802 — имя задано базовым классом
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)

        if path.startswith("/api/"):
            self.handle_api("GET", path)
            return

        self.serve_static(path)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        self.handle_api("POST", urllib.parse.unquote(parsed.path))

    def do_PUT(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        self.handle_api("PUT", urllib.parse.unquote(parsed.path))

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        self.handle_api("DELETE", urllib.parse.unquote(parsed.path))

    # ── статика ──

    def send_redirect(self, location: str) -> None:
        self.send_response(301)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def serve_static(self, path: str) -> None:
        # Без завершающего слэша браузер считал бы адресом папки корень сайта
        # и искал бы admin/css/admin.css в /css/admin.css.
        if path == "/admin":
            self.send_redirect("/admin/")
            return

        if path == "/admin/":
            self.send_file(ROOT_DIR / "admin" / "index.html")
            return

        relative = path.lstrip("/") or "index.html"
        target = (ROOT_DIR / relative).resolve()

        # Защита от выхода за пределы проекта
        try:
            target.relative_to(ROOT_DIR)
        except ValueError:
            self.send_error_json("Доступ запрещён", 403)
            return

        if target.is_dir():
            target = target / "index.html"

        if not target.exists() or not target.is_file():
            self.send_error_json("Страница не найдена", 404)
            return

        self.send_file(target)

    def send_file(self, target: Path) -> None:
        try:
            payload = target.read_bytes()
        except OSError:
            self.send_error_json("Файл недоступен", 404)
            return

        content_type, _ = mimetypes.guess_type(str(target))
        if target.suffix == ".js":
            content_type = "application/javascript"
        if content_type and content_type.startswith("text/"):
            content_type = f"{content_type}; charset=utf-8"
        if target.suffix in (".js", ".json"):
            content_type = f"{content_type}; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    # ── API ──

    def handle_api(self, method: str, path: str) -> None:
        try:
            self.consume_body()
            self.route_api(method, path)
        except ValueError as error:
            self.send_error_json(str(error), 400)
        except RuntimeError as error:
            self.send_error_json(str(error), 502)
        except Exception as error:  # noqa: BLE001 — сервер не должен падать из-за запроса
            log(f"Ошибка обработки {method} {path}: {error}")
            self.send_error_json("Внутренняя ошибка сервера", 500)

    def route_api(self, method: str, path: str) -> None:
        segments = [part for part in path.split("/") if part][1:]  # без «api»

        if not segments:
            self.send_error_json("Неизвестный запрос", 404)
            return

        head = segments[0]

        # ── health ──
        if head == "health" and method == "GET":
            self.send_json({"ok": True, "version": "1.0", "mode": "server"})
            return

        # ── auth ──
        if head == "auth":
            self.route_auth(method, segments[1:])
            return

        # ── всё остальное требует сессии ──
        if not self.require_session():
            return

        if head == "state":
            self.route_state(method, segments[1:])
            return

        if head == "publish" and method == "POST":
            body = self.read_body()
            content = body.get("data")
            if not isinstance(content, dict):
                raise ValueError("Ожидался объект контента")
            publish_content(content)
            self.send_json({"ok": True, "written": True, "updatedAt": now_iso()})
            return

        if head == "telegram":
            self.route_telegram(method, segments[1:])
            return

        self.send_error_json("Неизвестный запрос", 404)

    def route_auth(self, method: str, rest: list[str]) -> None:
        action = rest[0] if rest else ""

        if action == "session" and method == "GET":
            # Отсутствие сессии — обычное состояние гостя, а не ошибка:
            # отвечаем 200, чтобы страница входа не сорила 401 в консоли.
            session = self.current_session()
            self.send_json(
                {
                    "user": {"login": session["login"]} if session else None,
                    "usesDefaultPassword": bool(CONFIG["auth"].get("isDefault")),
                }
            )
            return

        if action == "login" and method == "POST":
            ip = self.client_ip()
            remaining = check_lockout(ip)
            if remaining:
                self.send_error_json(
                    f"Слишком много попыток. Повторите через {remaining} с.", 429
                )
                return

            body = self.read_body()
            login = str(body.get("login", "")).strip()
            password = str(body.get("password", ""))
            remember = bool(body.get("remember"))

            login_ok = hmac.compare_digest(login.lower(), str(CONFIG["auth"]["login"]).lower())
            password_ok = verify_password(password, CONFIG["auth"])

            if not (login_ok and password_ok):
                register_failure(ip)
                log(f"Неудачная попытка входа с {ip}")
                self.send_error_json("Неверный логин или пароль", 401)
                return

            reset_failures(ip)
            token, ttl = create_session(CONFIG["auth"]["login"], remember)
            cookie = self.session_cookie(token, ttl)
            log(f"Вход выполнен: {CONFIG['auth']['login']}")
            self.send_json(
                {
                    "user": {"login": CONFIG["auth"]["login"]},
                    "usesDefaultPassword": bool(CONFIG["auth"].get("isDefault")),
                },
                cookie=cookie,
            )
            return

        if action == "logout" and method == "POST":
            token = self.get_cookie(SESSION_COOKIE)
            if token:
                SESSIONS.pop(token, None)
                persist_sessions()
            self.send_json({"ok": True}, cookie=self.session_cookie("", 0))
            return

        if action == "password" and method == "POST":
            if not self.require_session():
                return
            body = self.read_body()
            current = str(body.get("current", ""))
            following = str(body.get("next", ""))
            new_login = str(body.get("login") or "").strip()

            if len(following) < 8:
                raise ValueError("Пароль должен быть не короче 8 символов")
            if not verify_password(current, CONFIG["auth"]):
                self.send_error_json("Текущий пароль указан неверно", 403)
                return

            salt = secrets.token_hex(16)
            CONFIG["auth"].update(
                {
                    "login": new_login or CONFIG["auth"]["login"],
                    "passwordSalt": salt,
                    "passwordHash": derive_password(following, salt, PBKDF2_ITERATIONS),
                    "iterations": PBKDF2_ITERATIONS,
                    # Возврат к паролю из коробки снова считается небезопасным.
                    "isDefault": following == DEFAULT_PASSWORD,
                }
            )
            save_config(CONFIG)

            SESSIONS.clear()
            persist_sessions()
            token, ttl = create_session(CONFIG["auth"]["login"], False)
            cookie = self.session_cookie(token, ttl)
            log("Пароль администратора изменён")
            self.send_json({"ok": True}, cookie=cookie)
            return

        self.send_error_json("Неизвестный запрос авторизации", 404)

    def route_state(self, method: str, rest: list[str]) -> None:
        if method == "GET" and not rest:
            self.send_json(
                {
                    "content": load_module("content", {}),
                    "published": load_module("published", {}),
                    "telegram": load_module("telegram", {}),
                    "brandOs": load_module("brandOs", {}),
                    "ai": load_module("ai", {}),
                    "apps": load_module("apps", {}),
                }
            )
            return

        if method == "PUT" and rest:
            name = rest[0]
            if name not in MODULE_FILES:
                self.send_error_json("Неизвестный раздел данных", 404)
                return
            body = self.read_body()
            if "data" not in body:
                raise ValueError("Ожидалось поле data")
            save_module(name, body["data"])
            self.send_json({"ok": True, "savedAt": now_iso()})
            return

        self.send_error_json("Неизвестный запрос данных", 404)

    def route_telegram(self, method: str, rest: list[str]) -> None:
        action = rest[0] if rest else ""

        if action == "verify" and method == "POST":
            result = telegram_request("getMe", {})
            self.send_json({"ok": True, "username": result.get("username")})
            return

        if action == "send" and method == "POST":
            body = self.read_body()
            if not str(body.get("text", "")).strip() and not body.get("imageUrl"):
                raise ValueError("Публикация пуста")
            result = telegram_send(body)
            log("Публикация отправлена в Telegram")
            self.send_json({"ok": True, **result})
            return

        self.send_error_json("Неизвестный запрос Telegram", 404)

    # ── журнал ──

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 — имя из базового класса
        if self.path.startswith("/api/"):
            log(f"{self.command} {self.path} → {args[1] if len(args) > 1 else ''}")


class Server(ThreadingHTTPServer):
    daemon_threads = True

    # В Windows SO_REUSEADDR позволяет второму процессу «занять» уже занятый
    # порт: запуск проходит молча, а запросы продолжает получать старый
    # экземпляр — со старыми настройками и данными. Лучше честно упасть.
    allow_reuse_address = os.name != "nt"


# ──────────────────────────── Запуск ────────────────────────────


def bootstrap_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Первый запуск: переносим текущий контент сайта в хранилище сервера.
    if not module_path("published").exists():
        site_content = SITE_DATA_DIR / "content.js"
        content: dict = {}
        if site_content.exists():
            try:
                content = extract_content_object(site_content.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                log("Не удалось разобрать data/content.js — начинаем с пустого контента")
        write_json(module_path("published"), content)
        write_json(module_path("content"), content)
        log("Контент сайта загружен в хранилище сервера")

    for name in ("telegram", "brandOs", "ai", "apps"):
        if not module_path(name).exists():
            write_json(module_path(name), {})


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass

    bootstrap_storage()
    restore_sessions()

    threading.Thread(target=scheduler_loop, name="telegram-scheduler", daemon=True).start()

    host = os.environ.get("ADMIN_HOST", CONFIG.get("host", "127.0.0.1"))
    port = int(os.environ.get("ADMIN_PORT", CONFIG.get("port", 8787)))

    try:
        httpd_context = Server((host, port), Handler)
    except OSError as error:
        log(f"Порт {port} занят — вероятно, сервер панели уже запущен ({error})")
        log("Закройте прежнее окно сервера или укажите другой порт: ADMIN_PORT")
        raise SystemExit(1)

    with httpd_context as httpd:
        log("Сервер панели «Сомной_легко» запущен")
        log(f"Сайт:   http://{host}:{port}/")
        log(f"Панель: http://{host}:{port}/admin")
        if CONFIG["auth"].get("isDefault"):
            log(f"Вход по умолчанию: {DEFAULT_LOGIN} / {DEFAULT_PASSWORD} — смените пароль")
        if not CONFIG["telegram"].get("botToken"):
            log("Telegram: токен не задан (server/config.json → telegram.botToken)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log("Остановка сервера")


if __name__ == "__main__":
    main()
