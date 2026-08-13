#!/usr/bin/env bash
#
# Самопроверка установочных файлов: синтаксис, подстановки в шаблонах и логика
# определения того, что домен уже указывает на этот сервер.
#
# Ничего не устанавливает и не меняет — можно запускать до install.sh.
#
#   bash deploy/selftest.sh [домен]

set -uo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${1:-somnoilegko.ru}"
INSTALL="$DEPLOY_DIR/install.sh"
FAILED=0

ok()   { printf '[OK ] %s\n' "$*"; }
bad()  { printf '[FAIL] %s\n' "$*"; FAILED=1; }
check() { if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi; }

# ── 1. Синтаксис ──
for script in install.sh update.sh selftest.sh; do
  if bash -n "$DEPLOY_DIR/$script" 2>/dev/null; then
    ok "синтаксис $script"
  else
    bad "синтаксис $script"
  fi
done

# ── 2. Шаблоны разворачиваются полностью ──
WORK="$(mktemp -d)"
sed \
  -e "s|__USER__|somnoilegko|g" \
  -e "s|__APP_DIR__|/opt/somnoilegko|g" \
  -e "s|__PORT__|8787|g" \
  -e "s|__CONFIG_PATH__|/etc/somnoilegko/config.json|g" \
  -e "s|__CONFIG_DIR__|/etc/somnoilegko|g" \
  -e "s|__DATA_DIR__|/var/lib/somnoilegko/data|g" \
  "$DEPLOY_DIR/somnoilegko.service" > "$WORK/service"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__PORT__|8787|g" \
  "$DEPLOY_DIR/nginx.conf" > "$WORK/nginx"

if grep -q "__" "$WORK/service" "$WORK/nginx"; then
  bad "в шаблонах остались незаполненные подстановки"
else
  ok "шаблоны разворачиваются полностью"
fi

grep -q "ExecStart=/usr/bin/python3 /opt/somnoilegko/server/app.py" "$WORK/service" \
  && ok "юнит запускает приложение из папки проекта" \
  || bad "юнит запускает приложение из папки проекта"
grep -q "Environment=ADMIN_HOST=127.0.0.1" "$WORK/service" \
  && ok "приложение слушает только localhost" \
  || bad "приложение слушает только localhost"
grep -q "proxy_set_header X-Forwarded-Proto" "$WORK/nginx" \
  && ok "nginx сообщает приложению про HTTPS" \
  || bad "nginx сообщает приложению про HTTPS"
grep -q "server_name $DOMAIN www.$DOMAIN;" "$WORK/nginx" \
  && ok "домен подставлен в nginx" \
  || bad "домен подставлен в nginx"

# ── 3. Логика определения DNS ──
# Функции берём из install.sh, чтобы проверять именно рабочий код.
eval "$(sed -n '/^server_ips()/,/^}/p;/^domain_ips()/,/^}/p;/^clean_ips()/,/^}/p;/^dns_ready()/,/^}/p' "$INSTALL")"

# В Windows python3 — заглушка из Microsoft Store: проверяем не наличие, а работу.
if ! python3 -c "print(1)" >/dev/null 2>&1 && python -c "print(1)" >/dev/null 2>&1; then
  printf '#!/usr/bin/env bash\nexec python "$@"\n' > "$WORK/python3"
  chmod +x "$WORK/python3"
  PATH="$WORK:$PATH"
fi

REAL_IPS="$(domain_ips | clean_ips)"
if [ -n "$REAL_IPS" ]; then
  ok "домен $DOMAIN разрешается: $(echo "$REAL_IPS" | tr '\n' ' ')"
else
  bad "домен $DOMAIN не разрешается"
fi

hostname() { echo "10.255.255.1 "; }
curl() { return 1; }
if dns_ready; then
  bad "чужой адрес принят за свой"
else
  ok "чужой адрес не принимается за свой"
fi

if [ -n "$REAL_IPS" ]; then
  MATCH="$(echo "$REAL_IPS" | head -n 1)"
  hostname() { echo "$MATCH "; }
  if dns_ready; then
    ok "совпадение адреса распознано ($MATCH)"
  else
    bad "совпадение адреса не распознано ($MATCH)"
  fi
fi

DOMAIN="somnoilegko-domain-does-not-exist-12345.invalid"
if dns_ready; then
  bad "неразрешимый домен считается готовым"
else
  ok "неразрешимый домен не считается готовым"
fi

unset -f hostname curl
rm -rf "$WORK"

echo
if [ "$FAILED" = "0" ]; then
  echo "Установочные файлы: замечаний нет."
else
  echo "Есть проблемы — смотрите строки FAIL."
fi
exit "$FAILED"
