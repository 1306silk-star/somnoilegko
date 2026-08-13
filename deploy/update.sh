#!/usr/bin/env bash
#
# Обновление кода сайта и панели на сервере.
#
# Контент правится через панель и живёт в data/content.js — этот файл
# сохраняется, чтобы обновление кода не откатило опубликованные тексты.
# Настройки и данные панели лежат вне папки проекта и не затрагиваются.
#
#   sudo bash /opt/somnoilegko/deploy/update.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/somnoilegko}"
APP_USER="${APP_USER:-somnoilegko}"
BRANCH="${REPO_BRANCH:-main}"
SERVICE="somnoilegko"
PORT="${ADMIN_PORT:-8787}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Запустите с правами root: sudo bash $0"
[ -d "$APP_DIR/.git" ] || fail "Проект не найден в $APP_DIR — сначала выполните deploy/install.sh"

BACKUP="$(mktemp -d)/content.js"

step "Сохраняю опубликованный контент"
if [ -f "$APP_DIR/data/content.js" ]; then
  cp "$APP_DIR/data/content.js" "$BACKUP"
  info "копия сделана"
fi

step "Обновляю код"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
info "версия: $(git -C "$APP_DIR" log -1 --format='%h %s')"

if [ -f "$BACKUP" ]; then
  cp "$BACKUP" "$APP_DIR/data/content.js"
  info "контент восстановлен"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

step "Перезапускаю сервис"
systemctl restart "$SERVICE"
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    printf '\n\033[1;32m✓ Обновлено, приложение отвечает\033[0m\n\n'
    exit 0
  fi
  sleep 1
done

fail "Приложение не отвечает после перезапуска. Журнал: journalctl -u $SERVICE -n 50"
