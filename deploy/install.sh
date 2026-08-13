#!/usr/bin/env bash
#
# Установка сайта и панели «Сомной_легко» на чистый сервер Ubuntu/Debian.
#
# Одна команда делает всё: ставит зависимости, забирает проект из GitHub,
# поднимает приложение под systemd, выводит его наружу через nginx, получает
# сертификат Let's Encrypt и включает автозапуск.
#
# Запуск на сервере:
#   curl -fsSL https://raw.githubusercontent.com/1306silk-star/somnoilegko/main/deploy/install.sh \
#     | sudo bash -s -- somnoilegko.ru
#
# Повторный запуск безопасен: пароль администратора, контент и данные панели
# не перезаписываются.

set -euo pipefail

DOMAIN="${1:-somnoilegko.ru}"
EMAIL="${2:-}"
REPO="${REPO_URL:-https://github.com/1306silk-star/somnoilegko.git}"
BRANCH="${REPO_BRANCH:-main}"

APP_USER="somnoilegko"
APP_DIR="/opt/somnoilegko"
CONFIG_DIR="/etc/somnoilegko"
CONFIG_PATH="$CONFIG_DIR/config.json"
DATA_DIR="/var/lib/somnoilegko/data"
PORT="${ADMIN_PORT:-8787}"
SERVICE="somnoilegko"
DNS_WAIT_SECONDS="${DNS_WAIT_SECONDS:-900}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Запустите с правами root: sudo bash install.sh $DOMAIN"
command -v apt-get >/dev/null 2>&1 || fail "Скрипт рассчитан на Ubuntu или Debian."

printf '\n\033[1m Сомной_легко — установка на %s\033[0m\n' "$DOMAIN"

# ─────────────────────────── Зависимости ───────────────────────────

step "Устанавливаю зависимости"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 git nginx curl ca-certificates certbot python3-certbot-nginx
info "python3 $(python3 --version 2>&1 | awk '{print $2}'), nginx, certbot — готовы"

# ─────────────────────────── Проект ───────────────────────────

step "Забираю проект из GitHub"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

# Папка проекта принадлежит служебному пользователю, а git здесь работает от
# root — без этого свежий git откажется её обслуживать.
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$REPO"
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  # Контент сайта редактируется через панель, поэтому сохраняем его при обновлении.
  if [ -f "$APP_DIR/data/content.js" ]; then
    cp "$APP_DIR/data/content.js" "/tmp/content.js.keep"
  fi
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
  if [ -f "/tmp/content.js.keep" ]; then
    mv "/tmp/content.js.keep" "$APP_DIR/data/content.js"
    info "контент сайта сохранён"
  fi
  info "код обновлён до origin/$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
  info "проект склонирован в $APP_DIR"
fi

install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$CONFIG_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ─────────────────────────── Настройки ───────────────────────────

step "Готовлю настройки"
if [ -f "$CONFIG_PATH" ]; then
  info "$CONFIG_PATH уже есть — пароль и токены не трогаю"
else
  cat > "$CONFIG_PATH" <<JSON
{
  "host": "127.0.0.1",
  "port": $PORT,
  "trustProxy": true,
  "forceSecureCookie": false,
  "telegram": {
    "botToken": "",
    "chatId": "",
    "parseMode": "HTML"
  }
}
JSON
  info "создан $CONFIG_PATH (пароль появится при первом запуске)"
fi
chown "$APP_USER:$APP_USER" "$CONFIG_PATH"
chmod 600 "$CONFIG_PATH"

# ─────────────────────────── Автозапуск ───────────────────────────

step "Настраиваю автозапуск"
sed \
  -e "s|__USER__|$APP_USER|g" \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  -e "s|__PORT__|$PORT|g" \
  -e "s|__CONFIG_PATH__|$CONFIG_PATH|g" \
  -e "s|__CONFIG_DIR__|$CONFIG_DIR|g" \
  -e "s|__DATA_DIR__|$DATA_DIR|g" \
  "$APP_DIR/deploy/somnoilegko.service" > "/etc/systemd/system/$SERVICE.service"

systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    info "приложение отвечает на 127.0.0.1:$PORT"
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 ||
  fail "Приложение не отвечает. Журнал: journalctl -u $SERVICE -n 50"

# ─────────────────────────── nginx ───────────────────────────

step "Вывожу сайт наружу через nginx"
NGINX_SITE="/etc/nginx/sites-available/$SERVICE"
if [ -f "$NGINX_SITE" ] && grep -q "ssl_certificate" "$NGINX_SITE"; then
  # Конфигурацию уже дополнил certbot — перезапись убрала бы HTTPS.
  info "конфигурация с сертификатом уже есть, оставляю как есть"
else
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__PORT__|$PORT|g" \
    "$APP_DIR/deploy/nginx.conf" > "$NGINX_SITE"
fi
ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$SERVICE"
rm -f /etc/nginx/sites-enabled/default

nginx -t >/dev/null 2>&1 || fail "nginx отверг конфигурацию: nginx -t"
systemctl enable --quiet nginx 2>/dev/null || true
systemctl reload nginx
info "nginx принимает запросы"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  info "порты 80 и 443 открыты в ufw"
fi

# ─────────────────────────── HTTPS ───────────────────────────

server_ips() {
  local public
  public="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null | tr -d '[:space:]' || true)"
  [ -n "$public" ] && printf '%s\n' "$public"
  hostname -I 2>/dev/null | tr ' ' '\n' | tr -d '\r'
}

domain_ips() {
  # getent есть в любой Ubuntu; python3 — запас на случай урезанного образа.
  if command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u
  fi
  python3 - "$DOMAIN" <<'PY' 2>/dev/null || true
import socket, sys
try:
    for item in socket.getaddrinfo(sys.argv[1], None, socket.AF_INET):
        print(item[4][0])
except OSError:
    pass
PY
}

# Адреса из обоих источников — без пустых строк и возврата каретки.
clean_ips() {
  tr -d '\r' | grep -Eo '^[0-9]+(\.[0-9]+){3}$' | sort -u
}

dns_ready() {
  local mine theirs ip
  mine="$(server_ips | clean_ips)"
  theirs="$(domain_ips | clean_ips)"
  [ -n "$theirs" ] && [ -n "$mine" ] || return 1
  for ip in $theirs; do
    if printf '%s\n' "$mine" | grep -qxF "$ip"; then return 0; fi
  done
  return 1
}

step "Проверяю, что домен указывает на этот сервер"
MY_IP="$(server_ips | grep -v '^$' | head -n 1)"
if dns_ready; then
  info "домен $DOMAIN уже ведёт сюда"
else
  warn "Домен $DOMAIN пока не ведёт на этот сервер ($MY_IP)."
  warn "Укажите в панели Timeweb A-запись: $DOMAIN → $MY_IP (и www.$DOMAIN → $MY_IP)."
  info "Жду обновления DNS до $((DNS_WAIT_SECONDS / 60)) минут, сертификат выпущу сам."
  waited=0
  while [ "$waited" -lt "$DNS_WAIT_SECONDS" ]; do
    sleep 20
    waited=$((waited + 20))
    if dns_ready; then
      info "домен появился через $((waited / 60)) мин $((waited % 60)) с"
      break
    fi
  done
fi

CERT_DONE=0
if dns_ready; then
  step "Получаю сертификат Let's Encrypt"
  CERTBOT_ARGS=(--nginx --non-interactive --agree-tos --redirect
                -d "$DOMAIN" -d "www.$DOMAIN")
  if [ -n "$EMAIL" ]; then
    CERTBOT_ARGS+=(-m "$EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi
  if certbot "${CERTBOT_ARGS[@]}"; then
    CERT_DONE=1
    systemctl reload nginx
    info "HTTPS включён, обновление сертификата — автоматическое"
  else
    warn "Сертификат получить не удалось. Сайт работает по http://"
    warn "Повторить можно так: certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect"
  fi
else
  warn "DNS так и не обновился — сайт работает по http://$MY_IP"
  warn "После настройки A-записи выпустите сертификат:"
  warn "  certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect"
fi

# ─────────────────────────── Итог ───────────────────────────

SCHEME="http"
[ "$CERT_DONE" -eq 1 ] && SCHEME="https"

printf '\n\033[1;32m✓ Готово\033[0m\n\n'
printf '  Сайт:   %s://%s/\n' "$SCHEME" "$DOMAIN"
printf '  Панель: %s://%s/admin\n' "$SCHEME" "$DOMAIN"
printf '  Вход:   admin / somnoilegko — смените пароль сразу, в разделе «Настройки»\n\n'
printf '  Настройки: %s\n' "$CONFIG_PATH"
printf '  Данные:    %s\n' "$DATA_DIR"
printf '  Журнал:    journalctl -u %s -f\n' "$SERVICE"
printf '  Обновить:  bash %s/deploy/update.sh\n\n' "$APP_DIR"
