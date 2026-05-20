#!/usr/bin/env bash
# Yet Another YouTube Downloader (YAYTD) — interactive full native Linux installer
# Handles: packages, PostgreSQL, .env, build, systemd, optional nginx site.
#
# Usage:
#   sudo ./scripts/install.sh              # interactive wizard
#   sudo ./scripts/install.sh -y           # defaults; all secrets auto-generated
#   sudo ./scripts/install.sh --non-interactive  # requires YAYTD_* env vars
#
# Environment (non-interactive / overrides):
#   YAYTD_DOMAIN, YAYTD_APP_URL, YAYTD_APP_DIR, YAYTD_DATA_DIR, YAYTD_USER
#   YAYTD_DB_NAME, YAYTD_DB_USER, YAYTD_DB_HOST, YAYTD_DB_PORT, YAYTD_DB_PASSWORD
#   YAYTD_REDIS_URL, YAYTD_PORT, YAYTD_ADMIN_PASSWORD, YAYTD_QUEUE_CONCURRENCY
#   YAYTD_INSTALL_NGINX=yes|no, YAYTD_SKIP_PACKAGES=1, YAYTD_SKIP_BUILD=1
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_DOMAIN="${YAYTD_DOMAIN:-yaytd.example.com}"
DEFAULT_APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
DEFAULT_DATA_DIR="${YAYTD_DATA_DIR:-/var/lib/yaytd/downloads}"
DEFAULT_USER="${YAYTD_USER:-yaytd}"
DEFAULT_DB_NAME="${YAYTD_DB_NAME:-yaytd}"
DEFAULT_DB_USER="${YAYTD_DB_USER:-yaytd}"
DEFAULT_DB_HOST="${YAYTD_DB_HOST:-127.0.0.1}"
DEFAULT_DB_PORT="${YAYTD_DB_PORT:-5432}"
DEFAULT_PORT="${YAYTD_PORT:-3000}"
DEFAULT_REDIS="${YAYTD_REDIS_URL:-redis://127.0.0.1:6379}"
DEFAULT_QUEUE="${YAYTD_QUEUE_CONCURRENCY:-4}"
DEFAULT_PENDING="${YAYTD_MAX_PENDING_JOBS:-10}"

INTERACTIVE=1
ASSUME_YES=0
SKIP_PACKAGES=0
SKIP_BUILD=0
SERVICES_ONLY=0
INSTALL_NGINX=""
REDEPLOY_MODE=0
PRESERVE_EXISTING_SECRETS=0

# ---------------------------------------------------------------------------
# UI helpers
# ---------------------------------------------------------------------------
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
err() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

die() { err "$*"; exit 1; }

# shellcheck source=lib-app-user.sh
. "$(cd "$(dirname "$0")" && pwd)/lib-app-user.sh"

# Cryptographically random secret (hex, URL/DB-safe)
rand_hex() {
  local nbytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${nbytes}"
  else
    head -c "${nbytes}" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Base64 secret for JWT/HMAC (min 32 bytes entropy)
rand_base64_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    rand_hex 32
  fi
}

generate_auth_secret() { rand_base64_secret; }

generate_download_token_secret() {
  local a b
  a="$(rand_base64_secret)"
  b="$(rand_base64_secret)"
  while [[ "${a}" == "${b}" ]]; do
    b="$(rand_base64_secret)"
  done
  echo "${b}"
}

usage() {
  cat <<'EOF'
Yet Another YouTube Downloader (YAYTD) — Debian/Ubuntu installer

  sudo ./scripts/install.sh                 Interactive wizard (recommended)
  sudo ./scripts/install.sh -y              Fast install (defaults; random secrets)
  sudo ./scripts/install.sh --non-interactive   All settings via YAYTD_* env vars

Options:
  -y, --yes              Use defaults; auto-generate all secrets
  --non-interactive      No prompts (optional YAYTD_* overrides; secrets auto-generated)
  --skip-packages        Skip apt / Node / yt-dlp installation
  --skip-build           Skip npm ci / build (config + systemd only)
  --services-only        Skip packages/build/DB — install systemd units only (redeploy helper)
  -h, --help             Show this help

Examples:
  sudo YAYTD_DOMAIN=dl.example.com YAYTD_DB_PASSWORD=secret ./scripts/install.sh --non-interactive
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes) ASSUME_YES=1; INTERACTIVE=0 ;;
      --non-interactive) INTERACTIVE=0; ASSUME_YES=1 ;;
      --skip-packages) SKIP_PACKAGES=1 ;;
      --skip-build) SKIP_BUILD=1 ;;
      --services-only) SERVICES_ONLY=1; SKIP_PACKAGES=1; SKIP_BUILD=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1 (try --help)" ;;
    esac
    shift
  done
}

prompt() {
  # prompt "Label" "default" -> sets REPLY
  local label="$1" default="$2"
  if [[ "${INTERACTIVE}" -eq 0 ]]; then
    REPLY="${default}"
    return
  fi
  if [[ "${ASSUME_YES}" -eq 1 ]]; then
    REPLY="${default}"
    printf '  %s [\033[2m%s\033[0m]\n' "${label}" "${default}"
    return
  fi
  read -r -p "${label} [${default}]: " REPLY
  REPLY="${REPLY:-${default}}"
}

prompt_secret() {
  # prompt_secret "Label" "ENV_VAR_NAME" -> sets REPLY
  local label="$1" envname="$2"
  if [[ -n "${!envname:-}" ]]; then
    REPLY="${!envname}"
    return
  fi
  if [[ "${INTERACTIVE}" -eq 0 && "${ASSUME_YES}" -eq 0 ]]; then
    die "Set ${envname} for non-interactive install"
  fi
  read -rsp "${label}: " REPLY
  echo
}

prompt_yes_no() {
  # prompt_yes_no "Question" "default_y|n" -> sets REPLY to 1 or 0
  local label="$1" default="$2"
  local def_yn="y"
  [[ "${default}" == "n" || "${default}" == "N" ]] && def_yn="n"
  if [[ "${INTERACTIVE}" -eq 0 ]]; then
    REPLY=$([[ "${default}" =~ ^[yY] ]] && echo 1 || echo 0)
    return
  fi
  if [[ "${ASSUME_YES}" -eq 1 ]]; then
    REPLY=$([[ "${default}" =~ ^[yY] ]] && echo 1 || echo 0)
    return
  fi
  local ans=""
  read -r -p "${label} [${def_yn}]: " ans
  ans="${ans:-${def_yn}}"
  REPLY=$([[ "${ans}" =~ ^[yY] ]] && echo 1 || echo 0)
}

validate_domain() {
  [[ "${1}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || die "Invalid domain: ${1}"
}

validate_db_identifier() {
  [[ "${1}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "Invalid DB name/user: ${1}"
}

validate_abs_path() {
  [[ "${1}" == /* ]] || die "Path must be absolute: ${1}"
}

# Load prior install.conf (redeploy / --skip-packages).
load_install_config() {
  local cfg="${1:-}"
  [[ -n "${cfg}" && -f "${cfg}" ]] || return 1
  # shellcheck disable=SC1090
  source "${cfg}"
  return 0
}

preserve_env_secrets() {
  local envfile="${APP_DIR}/.env"
  [[ -f "${envfile}" ]] || return 0
  local line val
  for line in AUTH_SECRET DOWNLOAD_TOKEN_SECRET APP_URL REDIS_URL; do
    val="$(grep -E "^${line}=" "${envfile}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
    [[ -n "${val}" ]] && printf -v "${line}" '%s' "${val}"
  done
  val="$(grep -E '^QUEUE_CONCURRENCY=' "${envfile}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
  [[ -n "${val}" ]] && QUEUE_CONCURRENCY="${val}"

  local dburl
  dburl="$(grep -E '^DATABASE_URL=' "${envfile}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
  if [[ -n "${dburl}" ]] && parse_database_url "${dburl}"; then
    PRESERVE_EXISTING_SECRETS=1
  fi

  local secrets="${APP_DIR}/.install-secrets"
  if [[ -f "${secrets}" ]]; then
    val="$(grep -E '^admin_password=' "${secrets}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
    [[ -n "${val}" ]] && ADMIN_PASSWORD="${val}"
    val="$(grep -E '^invite_token=' "${secrets}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
    [[ -n "${val}" ]] && INVITE_TOKEN="${val}"
  fi
}

load_redeploy_from_existing() {
  local envfile="${DEFAULT_APP_DIR}/.env"
  [[ -f "${envfile}" ]] || return 1
  APP_DIR="${DEFAULT_APP_DIR}"
  DATA_DIR="${DATA_DIR:-${DEFAULT_DATA_DIR}}"
  SYSTEM_USER="${SYSTEM_USER:-${DEFAULT_USER}}"
  APP_PORT="${APP_PORT:-${DEFAULT_PORT}}"
  MAX_PENDING="${MAX_PENDING:-${DEFAULT_PENDING}}"
  INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"
  [[ -z "${INSTALL_NGINX}" ]] && INSTALL_NGINX="no"
  preserve_env_secrets
  if [[ -n "${APP_URL:-}" ]]; then
    DOMAIN="${APP_URL#https://}"
    DOMAIN="${DOMAIN#http://}"
    DOMAIN="${DOMAIN%%/*}"
  else
    DOMAIN="${DEFAULT_DOMAIN}"
    APP_URL="https://${DOMAIN}"
  fi
  REDEPLOY_MODE=1
  PRESERVE_EXISTING_SECRETS=1
  dim "Reusing existing ${envfile} (redeploy; DB password unchanged)"
  return 0
}

# ---------------------------------------------------------------------------
# Configuration wizard
# ---------------------------------------------------------------------------
run_wizard() {
  if [[ "${SKIP_PACKAGES}" -eq 1 ]]; then
    if load_install_config "${DEFAULT_APP_DIR}/install.conf"; then
      APP_DIR="${APP_DIR:-${DEFAULT_APP_DIR}}"
      DATA_DIR="${DATA_DIR:-${DEFAULT_DATA_DIR}}"
      SYSTEM_USER="${SYSTEM_USER:-${DEFAULT_USER}}"
      APP_PORT="${APP_PORT:-${DEFAULT_PORT}}"
      DB_NAME="${DB_NAME:-${DEFAULT_DB_NAME}}"
      DB_USER="${DB_USER:-${DEFAULT_DB_USER}}"
      DB_HOST="${DB_HOST:-${DEFAULT_DB_HOST}}"
      DB_PORT="${DB_PORT:-${DEFAULT_DB_PORT}}"
      REDIS_URL="${REDIS_URL:-${DEFAULT_REDIS}}"
      QUEUE_CONCURRENCY="${QUEUE_CONCURRENCY:-${DEFAULT_QUEUE}}"
      MAX_PENDING="${MAX_PENDING:-${DEFAULT_PENDING}}"
      INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-1}"
      [[ -z "${INSTALL_NGINX}" ]] && INSTALL_NGINX="no"
      preserve_env_secrets
      REDEPLOY_MODE=1
      [[ "${PRESERVE_EXISTING_SECRETS}" -eq 1 ]] || DB_PASSWORD="${DB_PASSWORD:-$(rand_hex 24)}"
      ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(rand_hex 16)}"
      INVITE_TOKEN="${INVITE_TOKEN:-$(rand_hex 32)}"
      dim "Reusing ${APP_DIR}/install.conf (non-interactive redeploy)"
      return
    fi
    if load_redeploy_from_existing; then
      return
    fi
  fi

  bold ""
  bold "  Yet Another YouTube Downloader (YAYTD)"
  bold "  Interactive installer"
  dim "  Press Enter to accept [bracketed] defaults."
  echo ""

  if [[ -n "${YAYTD_APP_URL:-}" ]]; then
    DOMAIN="${YAYTD_APP_URL#https://}"
    DOMAIN="${DOMAIN#http://}"
    DOMAIN="${DOMAIN%%/*}"
  else
    prompt "Public domain (no https://)" "${DEFAULT_DOMAIN}"
    DOMAIN="${REPLY}"
  fi
  validate_domain "${DOMAIN}"

  prompt_yes_no "Use HTTPS in public URLs?" "y"
  USE_HTTPS="${REPLY}"
  if [[ "${USE_HTTPS}" -eq 1 ]]; then
    APP_URL="https://${DOMAIN}"
  else
    APP_URL="http://${DOMAIN}"
  fi

  prompt "Application install directory" "${DEFAULT_APP_DIR}"
  APP_DIR="${REPLY}"
  validate_abs_path "${APP_DIR}"

  prompt "Download / temp data directory" "${DEFAULT_DATA_DIR}"
  DATA_DIR="${REPLY}"
  validate_abs_path "${DATA_DIR}"

  prompt "Linux system user for the app" "${DEFAULT_USER}"
  SYSTEM_USER="${REPLY}"
  [[ "${SYSTEM_USER}" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "Invalid system username"

  prompt "Node.js listen port (reverse proxy upstream)" "${DEFAULT_PORT}"
  APP_PORT="${REPLY}"
  [[ "${APP_PORT}" =~ ^[0-9]+$ ]] || die "Invalid port"
  (( APP_PORT >= 1 && APP_PORT <= 65535 )) || die "Invalid port (use 1-65535)"

  bold ""
  dim "  --- PostgreSQL ---"
  prompt "Database name" "${DEFAULT_DB_NAME}"
  DB_NAME="${REPLY}"
  validate_db_identifier "${DB_NAME}"

  prompt "Database user" "${DEFAULT_DB_USER}"
  DB_USER="${REPLY}"
  validate_db_identifier "${DB_USER}"

  prompt "Database host" "${DEFAULT_DB_HOST}"
  DB_HOST="${REPLY}"

  prompt "Database port" "${DEFAULT_DB_PORT}"
  DB_PORT="${REPLY}"

  if [[ -n "${YAYTD_DB_PASSWORD:-}" ]]; then
    DB_PASSWORD="${YAYTD_DB_PASSWORD}"
  elif [[ "${INTERACTIVE}" -eq 1 && "${ASSUME_YES}" -eq 0 ]]; then
    prompt_yes_no "Generate random database password?" "y"
    if [[ "${REPLY}" -eq 1 ]]; then
      DB_PASSWORD="$(rand_hex 24)"
      ok "Using generated database password (saved to .install-secrets after install)"
    else
      prompt_secret "Database password" "YAYTD_DB_PASSWORD"
      DB_PASSWORD="${REPLY}"
      local confirm=""
      read -rsp "Confirm database password: " confirm
      echo
      [[ "${DB_PASSWORD}" == "${confirm}" ]] || die "Database passwords do not match"
    fi
  else
    DB_PASSWORD="$(rand_hex 24)"
    dim "  Auto-generated database password"
  fi
  [[ -n "${DB_PASSWORD}" ]] || die "Database password is required"

  bold ""
  dim "  --- Redis / workers ---"
  prompt "Redis URL" "${DEFAULT_REDIS}"
  REDIS_URL="${REPLY}"

  prompt "Parallel download workers (QUEUE_CONCURRENCY)" "${DEFAULT_QUEUE}"
  QUEUE_CONCURRENCY="${REPLY}"

  prompt "Max pending jobs per user" "${DEFAULT_PENDING}"
  MAX_PENDING="${REPLY}"

  bold ""
  dim "  --- Admin account (first login) ---"
  if [[ -n "${YAYTD_ADMIN_PASSWORD:-}" ]]; then
    ADMIN_PASSWORD="${YAYTD_ADMIN_PASSWORD}"
  elif [[ "${INTERACTIVE}" -eq 1 && "${ASSUME_YES}" -eq 0 ]]; then
    prompt_yes_no "Generate random admin password (user: admin)?" "y"
    if [[ "${REPLY}" -eq 1 ]]; then
      ADMIN_PASSWORD="$(rand_hex 16)"
      ok "Using generated admin password (saved to .install-secrets)"
    else
      prompt_secret "Admin password" "YAYTD_ADMIN_PASSWORD"
      ADMIN_PASSWORD="${REPLY}"
      [[ -n "${ADMIN_PASSWORD}" ]] || die "Admin password is required"
    fi
  else
    ADMIN_PASSWORD="$(rand_hex 16)"
    dim "  Auto-generated admin password"
  fi

  prompt_yes_no "Install / enable systemd services (yaytd + yaytd-worker)?" "y"
  INSTALL_SYSTEMD="${REPLY}"

  if [[ -z "${INSTALL_NGINX}" ]]; then
    prompt_yes_no "Write Nginx reverse-proxy config to /etc/nginx/sites-available/yaytd?" "n"
    INSTALL_NGINX=$([[ "${REPLY}" -eq 1 ]] && echo "yes" || echo "no")
  fi

  if [[ -n "${YAYTD_INSTALL_SYSTEMD:-}" ]]; then
    if [[ "${YAYTD_INSTALL_SYSTEMD}" =~ ^[yY1] ]]; then
      INSTALL_SYSTEMD=1
    else
      INSTALL_SYSTEMD=0
    fi
  fi

  bold ""
  dim "  --- Optional ---"
  prompt "MaxMind license key (GeoIP, leave empty to skip)" "${MAXMIND_LICENSE_KEY:-}"
  MAXMIND_KEY="${REPLY}"

  INVITE_TOKEN="$(rand_hex 32)"

  if [[ "${INTERACTIVE}" -eq 1 && "${ASSUME_YES}" -eq 0 ]]; then
    echo ""
    bold "  Configuration summary"
    echo "  Public URL:     ${APP_URL}"
    echo "  App directory:  ${APP_DIR}"
    echo "  Data directory: ${DATA_DIR}"
    echo "  System user:    ${SYSTEM_USER}"
    echo "  Upstream:       http://127.0.0.1:${APP_PORT}"
    echo "  Database:       postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    echo "  Redis:          ${REDIS_URL}"
    echo "  Systemd:        $([[ "${INSTALL_SYSTEMD}" -eq 1 ]] && echo yes || echo no)"
    echo "  Nginx site:     ${INSTALL_NGINX}"
    echo ""
    prompt_yes_no "Proceed with installation?" "y"
    [[ "${REPLY}" -eq 1 ]] || die "Installation cancelled"
  fi
}

# ---------------------------------------------------------------------------
# .env writer
# ---------------------------------------------------------------------------
write_env_file() {
  local target="$1"
  AUTH_SECRET="${AUTH_SECRET:-$(generate_auth_secret)}"
  DOWNLOAD_TOKEN_SECRET="${DOWNLOAD_TOKEN_SECRET:-$(generate_download_token_secret)}"

  local db_url
  db_url="$(build_database_url)"

  cat > "${target}" <<EOF
# Generated by scripts/install.sh on $(date -Iseconds)
# Yet Another YouTube Downloader (YAYTD)
# All secrets below were generated randomly — keep this file private (chmod 600).

DATABASE_URL="${db_url}"

AUTH_SECRET="${AUTH_SECRET}"
DOWNLOAD_TOKEN_SECRET="${DOWNLOAD_TOKEN_SECRET}"
PASSWORD_HASH_ALGORITHM="argon2id"
ARGON2_MEMORY_COST="65536"
ARGON2_TIME_COST="3"
ARGON2_PARALLELISM="4"
BCRYPT_COST="12"

APP_URL="${APP_URL}"
AUTH_URL="${APP_URL}"
NEXTAUTH_URL="${APP_URL}"
NEXT_PUBLIC_APP_URL="${APP_URL}"
AUTH_TRUST_HOST="true"

SESSION_MAX_AGE_SECONDS="604800"
SESSION_UPDATE_AGE_SECONDS="86400"

TRUST_PROXY="true"
TRUSTED_PROXY_HOPS="1"
ALLOWED_HOSTS="${DOMAIN}"

MAXMIND_LICENSE_KEY="${MAXMIND_KEY}"
MAXMIND_ACCOUNT_ID=""
MAXMIND_GEOLITE_CITY_PATH="${APP_DIR}/data/GeoLite2-City.mmdb"
LOGIN_HISTORY_LIMIT="50"
LOGIN_HISTORY_RETENTION_DAYS="90"

NODE_ENV="production"
NEXT_TELEMETRY_DISABLED="1"
TEMP_DOWNLOAD_DIR="${DATA_DIR}"
JOB_TTL_HOURS="2"

MAX_VIDEO_DURATION_SECONDS="7200"
MAX_OUTPUT_BYTES="2147483648"
MAX_CONCURRENT_JOBS_PER_USER="3"
MAX_PENDING_JOBS_PER_USER="${MAX_PENDING}"

REDIS_URL="${REDIS_URL}"
QUEUE_CONCURRENCY="${QUEUE_CONCURRENCY}"
RATE_LIMIT_PROBE_PER_HOUR="10"
RATE_LIMIT_DOWNLOAD_PER_HOUR="5"
RATE_LIMIT_LOGIN_PER_HOUR="20"
YTDLP_TIMEOUT_MS="1800000"
YTDLP_PATH="yt-dlp"

ADMIN_DEFAULT_PASSWORD="${ADMIN_PASSWORD}"
EOF
  chmod 600 "${target}"
}

write_install_secrets_file() {
  local target="${APP_DIR}/.install-secrets"
  cat > "${target}" <<EOF
# YAYTD install credentials — $(date -Iseconds)
# DELETE this file after saving passwords to a password manager.
# JWT/session secrets live only in ${APP_DIR}/.env (not duplicated here).

database_user="${DB_USER}"
database_name="${DB_NAME}"
database_password="${DB_PASSWORD}"

admin_username="admin"
admin_password="${ADMIN_PASSWORD}"

invite_token="${INVITE_TOKEN}"
invite_register_hu="${APP_URL}/hu/register?invite=${INVITE_TOKEN}"
invite_register_en="${APP_URL}/en/register?invite=${INVITE_TOKEN}"

public_url="${APP_URL}"
EOF
  chmod 600 "${target}"
  chown "${SYSTEM_USER}:${SYSTEM_USER}" "${target}" 2>/dev/null || true
  INSTALL_SECRETS_FILE="${target}"
}

save_install_config() {
  local cfg="${APP_DIR}/install.conf"
  cat > "${cfg}" <<EOF
# YAYTD install configuration — $(date -Iseconds)
DOMAIN="${DOMAIN}"
APP_URL="${APP_URL}"
APP_DIR="${APP_DIR}"
DATA_DIR="${DATA_DIR}"
SYSTEM_USER="${SYSTEM_USER}"
APP_PORT="${APP_PORT}"
DB_NAME="${DB_NAME}"
DB_USER="${DB_USER}"
DB_HOST="${DB_HOST}"
DB_PORT="${DB_PORT}"
REDIS_URL="${REDIS_URL}"
QUEUE_CONCURRENCY="${QUEUE_CONCURRENCY}"
EOF
  chmod 600 "${cfg}"
}

# ---------------------------------------------------------------------------
# Systemd unit generation (paths substituted at install time)
# ---------------------------------------------------------------------------
install_systemd_units() {
  local npm_bin
  npm_bin="$(command -v npm || echo /usr/bin/npm)"

  cat > /etc/systemd/system/yaytd.service <<EOF
[Unit]
Description=Yet Another YouTube Downloader (YAYTD) — Next.js
Documentation=file://${APP_DIR}/README.md
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=${SYSTEM_USER}
Group=${SYSTEM_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=HOSTNAME=127.0.0.1

ExecStart=${npm_bin} run start:prod

Restart=on-failure
RestartSec=10
TimeoutStartSec=180

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/yaytd-worker.service <<EOF
[Unit]
Description=Yet Another YouTube Downloader (YAYTD) — download worker
After=network-online.target redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=${SYSTEM_USER}
Group=${SYSTEM_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=NODE_ENV=production

ExecStart=${npm_bin} run worker

Restart=on-failure
RestartSec=10

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${APP_DIR} /tmp

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable yaytd.service yaytd-worker.service
  ok "Systemd units installed (yaytd, yaytd-worker)"
}

install_nginx_site() {
  command -v nginx >/dev/null 2>&1 || {
    warn "nginx not installed — skipping site config"
    return
  }

  local site="/etc/nginx/sites-available/yaytd"
  cat > "${site}" <<EOF
# Yet Another YouTube Downloader (YAYTD) — generated by scripts/install.sh
# TLS terminates here; upstream is plain HTTP on 127.0.0.1:${APP_PORT}

server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # Update paths after obtaining certificates (e.g. certbot)
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

  ln -sf "${site}" /etc/nginx/sites-enabled/yaytd 2>/dev/null || true
  if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null || true
    ok "Nginx site written: ${site}"
    warn "Edit ssl_certificate paths, then: sudo certbot --nginx -d ${DOMAIN}"
  else
    warn "Nginx config test failed — fix SSL paths in ${site} before reload"
  fi
}

# ---------------------------------------------------------------------------
# Install steps
# ---------------------------------------------------------------------------
step_packages() {
  bold "==> [1/8] System packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y \
    curl ca-certificates gnupg postgresql postgresql-contrib \
    ffmpeg python3 python3-pip redis-server build-essential rsync openssl

  if ! command -v node >/dev/null 2>&1; then
    need_node=1
  else
    local node_major node_minor
    node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    node_minor="$(node -v | sed 's/^v//' | cut -d. -f2)"
    need_node=0
    if [[ "${node_major}" -lt 20 ]] || [[ "${node_major}" -eq 20 && "${node_minor}" -lt 19 ]]; then
      need_node=1
    fi
  fi
  if [[ "${need_node}" -eq 1 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  # shellcheck source=lib-npm.sh
  . "$(cd "$(dirname "$0")" && pwd)/lib-npm.sh"
  upgrade_system_npm
  ok "System npm $(npm -v) (node $(node -v))"

  if apt-cache show yt-dlp &>/dev/null; then
    apt-get install -y yt-dlp
  else
    pip3 install --break-system-packages -U yt-dlp 2>/dev/null || pip3 install -U yt-dlp
  fi

  if [[ "${INSTALL_NGINX}" == "yes" ]] && ! command -v nginx >/dev/null 2>&1; then
    apt-get install -y nginx
  fi

  systemctl enable redis-server 2>/dev/null || true
  systemctl start redis-server 2>/dev/null || true
  ok "System packages installed"
}

step_user_dirs() {
  bold "==> [2/8] System user and directories"
  if ! id "${SYSTEM_USER}" &>/dev/null; then
    useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${SYSTEM_USER}"
    ok "Created user ${SYSTEM_USER}"
  else
    ok "User ${SYSTEM_USER} exists"
  fi
  mkdir -p "${APP_DIR}" "${DATA_DIR}" "${APP_DIR}/data" "${APP_DIR}/.cache/npm"
  # shellcheck source=lib-npm.sh
  . "$(cd "$(dirname "$0")" && pwd)/lib-npm.sh"
  repair_npm_permissions "${APP_DIR}" "${SYSTEM_USER}"
  chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${DATA_DIR}" 2>/dev/null || true
}

step_postgres() {
  bold "==> [3/8] PostgreSQL"
  if [[ "${DB_HOST}" != "127.0.0.1" && "${DB_HOST}" != "localhost" ]]; then
    warn "Remote DB host ${DB_HOST} — skipping local role/database creation"
    warn "Ensure ${DB_NAME} exists and ${DB_USER} can connect"
    return
  fi

  local sql_pw="${DB_PASSWORD//\'/\'\'}"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${sql_pw}';"
    ok "Created role ${DB_USER}"
  else
    if [[ "${PRESERVE_EXISTING_SECRETS}" -eq 1 ]]; then
      ok "Keeping existing PostgreSQL password for ${DB_USER} (from ${APP_DIR}/.env)"
    else
      sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${sql_pw}';"
      ok "Updated password for ${DB_USER}"
    fi
  fi

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    ok "Created database ${DB_NAME}"
  else
    ok "Database ${DB_NAME} exists"
  fi
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true
}

step_env() {
  bold "==> [4/8] Environment file"
  preserve_env_secrets
  write_env_file "${SOURCE_DIR}/.env"
  cp "${SOURCE_DIR}/.env" "${APP_DIR}/.env"
  chown "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}/.env"
  write_install_secrets_file
  save_install_config
  if [[ "${PRESERVE_EXISTING_SECRETS}" -eq 1 ]]; then
    ok "Wrote ${APP_DIR}/.env (preserved existing secrets)"
  else
    ok "Wrote ${APP_DIR}/.env (random AUTH_SECRET + DOWNLOAD_TOKEN_SECRET)"
  fi
  ok "Wrote ${APP_DIR}/.install-secrets (DB + admin passwords)"

  ensure_db_credentials_synced "${APP_DIR}" "${SOURCE_DIR}" || warn "Database login check failed — will retry before migrate"
}

step_deploy() {
  bold "==> [5/8] Deploy application"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    --exclude data \
    "${SOURCE_DIR}/" "${APP_DIR}/"

  chmod +x "${APP_DIR}/install.sh" "${APP_DIR}/repair-db.sh" "${APP_DIR}/upgrade-npm.sh" 2>/dev/null || true
  chmod +x "${APP_DIR}"/scripts/*.sh 2>/dev/null || true

  ensure_app_dir_owned
  verify_package_lock "${SOURCE_DIR}"

  cd "${APP_DIR}"
  run_as_app_user npm ci
  run_as_app_user npm run build
  ensure_app_dir_owned
  ok "Application built in ${APP_DIR}"
}

step_database() {
  bold "==> [6/8] Database migrations and admin seed"
  if ! ensure_db_credentials_synced "${APP_DIR}" "${SOURCE_DIR}"; then
    die "Database credentials invalid. Run: sudo ${APP_DIR}/repair-db.sh --auto"
  fi
  cd "${APP_DIR}"
  run_as_app_user npm run db:migrate
  ADMIN_DEFAULT_PASSWORD="${ADMIN_PASSWORD}" run_as_app_user npm run db:seed-admin
  if [[ "${DB_HOST}" == "127.0.0.1" || "${DB_HOST}" == "localhost" ]]; then
    local sql_invite
    sql_invite="${INVITE_TOKEN//\'/\'\'}"
    sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c \
      "INSERT INTO \"SiteConfig\" (\"id\", \"inviteToken\", \"updatedAt\") VALUES ('default', '${sql_invite}', NOW()) ON CONFLICT (\"id\") DO UPDATE SET \"inviteToken\" = EXCLUDED.\"inviteToken\", \"updatedAt\" = NOW();" \
      2>/dev/null && ok "Generated random site invite token" \
      || warn "Could not set invite token — regenerate in admin Settings"
  fi
  ok "Migrations applied; admin user ready (username: admin)"
}

step_geoip() {
  if [[ -n "${MAXMIND_KEY}" ]]; then
    bold "==> [7/8] MaxMind GeoLite (optional)"
    cd "${APP_DIR}"
    run_as_app_user npm run geoip:update 2>/dev/null && ok "GeoLite database updated" || warn "GeoIP update failed (check MAXMIND_LICENSE_KEY)"
  else
    dim "==> [7/8] Skipping GeoIP (no MaxMind key)"
  fi
}

step_services() {
  bold "==> [8/8] Services"
  chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}" "${DATA_DIR}"

  if [[ "${INSTALL_SYSTEMD}" -eq 1 ]]; then
    install_systemd_units
    systemctl restart yaytd.service yaytd-worker.service 2>/dev/null \
      || systemctl start yaytd.service yaytd-worker.service
    sleep 2
    if systemctl is-active --quiet yaytd.service; then
      ok "yaytd.service is running"
    else
      warn "yaytd.service not active — check: journalctl -u yaytd -n 50"
    fi
  fi

  if [[ "${INSTALL_NGINX}" == "yes" ]]; then
    install_nginx_site
  fi
}

print_finish() {
  echo ""
  bold "=============================================="
  bold "  Yet Another YouTube Downloader — installation complete"
  bold "=============================================="
  echo ""
  echo "  Public URL:       ${APP_URL}"
  echo "  Domain:           ${DOMAIN}"
  echo "  Upstream (proxy): http://127.0.0.1:${APP_PORT}"
  echo "  Install path:     ${APP_DIR}"
  echo "  Data path:        ${DATA_DIR}"
  echo "  Config saved:     ${APP_DIR}/install.conf"
  echo ""
  echo "  Admin login:      admin / ${ADMIN_PASSWORD}"
  echo "  (Change password after first sign-in!)"
  echo ""
  echo "  Credentials file: ${INSTALL_SECRETS_FILE:-${APP_DIR}/.install-secrets}"
  echo "  Session/download secrets: ${APP_DIR}/.env (AUTH_SECRET, DOWNLOAD_TOKEN_SECRET)"
  echo "  Invite link (HU): ${APP_URL}/hu/register?invite=${INVITE_TOKEN}"
  echo "  Save credentials, then: rm -f ${APP_DIR}/.install-secrets"
  echo ""
  if [[ "${INSTALL_SYSTEMD}" -eq 1 ]]; then
    echo "  systemctl status yaytd yaytd-worker"
    echo "  journalctl -u yaytd -f"
  fi
  if [[ "${INSTALL_NGINX}" == "yes" ]]; then
    echo ""
    echo "  Nginx: edit SSL paths in /etc/nginx/sites-available/yaytd"
    echo "  certbot: sudo certbot --nginx -d ${DOMAIN}"
  else
    echo ""
    echo "  Point your reverse proxy at http://127.0.0.1:${APP_PORT}"
    echo "  Headers: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto=https"
  fi
  echo ""
  echo "  Redeploy after git pull: sudo ./scripts/deploy-native.sh"
  bold "=============================================="
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"

  if [[ "${SKIP_PACKAGES}" -eq 1 ]]; then
    ASSUME_YES=1
  fi

  if [[ "$(id -u)" -ne 0 ]]; then
    die "Run as root: sudo ./scripts/install.sh"
  fi

  if [[ ! -f /etc/debian_version ]] && [[ ! -f /etc/os-release ]]; then
    warn "This script targets Debian/Ubuntu; other distros may need manual steps"
  fi

  [[ -z "${INSTALL_NGINX}" ]] && INSTALL_NGINX="${YAYTD_INSTALL_NGINX:-}"
  [[ "${YAYTD_SKIP_PACKAGES:-}" == "1" ]] && SKIP_PACKAGES=1

  # shellcheck source=lib-db.sh
  . "$(cd "$(dirname "$0")" && pwd)/lib-db.sh"

  if [[ "${SERVICES_ONLY}" -eq 1 ]]; then
    load_install_config "${DEFAULT_APP_DIR}/install.conf" || true
    APP_DIR="${APP_DIR:-${DEFAULT_APP_DIR}}"
    DATA_DIR="${DATA_DIR:-${DEFAULT_DATA_DIR}}"
    SYSTEM_USER="${SYSTEM_USER:-${DEFAULT_USER}}"
    APP_PORT="${APP_PORT:-${DEFAULT_PORT}}"
    INSTALL_SYSTEMD=1
    preserve_env_secrets
    bold "==> Services-only mode (${APP_DIR})"
    step_services
    print_finish
    exit 0
  fi

  run_wizard

  echo ""
  if [[ "${SKIP_PACKAGES}" -eq 0 ]]; then
    step_packages
  else
    dim "==> Skipping system packages (--skip-packages)"
  fi

  step_user_dirs
  step_postgres
  step_env

  if [[ "${SKIP_BUILD}" -eq 0 ]]; then
    step_deploy
    step_database
    step_geoip
  else
    warn "Skipped build (--skip-build)"
  fi

  step_services
  print_finish
}

main "$@"
