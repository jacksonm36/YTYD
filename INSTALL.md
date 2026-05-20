# Yet Another YouTube Downloader (YAYTD) — production install

Repository: [github.com/jacksonm36/YTYD](https://github.com/jacksonm36/YTYD)

**YAYTD** = **Y**et **A**nother **Y**ou**T**ube **D**ownloader — self-hosted multi-platform downloader with invite-only registration, admin approval, and Redis-backed job queue.

## Requirements

- **Debian 12+** or **Ubuntu 22.04+**
- **root** (or sudo)
- Public **domain** pointing at the server (for HTTPS)
- ~2 GB disk for app + dependencies

## Install from GitHub

```bash
sudo apt-get update
sudo apt-get install -y git

git clone https://github.com/jacksonm36/YTYD.git
cd YTYD
chmod +x install.sh scripts/install.sh
sudo ./install.sh
```

The wizard installs Node 22, PostgreSQL, Redis, ffmpeg, yt-dlp, builds the app, runs migrations, and starts **systemd** services (`yaytd`, `yaytd-worker`).

### Fast / unattended install

```bash
git clone https://github.com/jacksonm36/YTYD.git
cd YTYD
chmod +x install.sh
sudo YAYTD_DOMAIN=yaytd.example.com ./install.sh --non-interactive
```

All secrets (**AUTH_SECRET**, **DOWNLOAD_TOKEN_SECRET**, DB password, admin password, invite token) are generated randomly.

Credentials are written to:

- `/opt/yaytd/.env` — app secrets (chmod 600)
- `/opt/yaytd/.install-secrets` — admin + DB passwords + invite links (delete after saving)

### After install

```bash
sudo systemctl status yaytd yaytd-worker
sudo journalctl -u yaytd -f
```

| Item | Location |
|------|----------|
| App | `/opt/yaytd` |
| Downloads | `/var/lib/yaytd/downloads` |
| Admin user | `admin` (password in `.install-secrets`) |
| Public URL | set in `.env` (`APP_URL`, etc.) |

Point your reverse proxy at `http://127.0.0.1:3000` with `X-Forwarded-Proto`, `X-Forwarded-For`, `X-Real-IP`. Example: [`deploy/nginx-yaytd.conf`](deploy/nginx-yaytd.conf).

### Redeploy after `git pull`

```bash
cd /path/to/YTYD
git pull
sudo ./scripts/deploy-native.sh
```

## Environment overrides

See `scripts/install.sh` header or run `./install.sh --help`.

Common variables: `YAYTD_DOMAIN`, `YAYTD_APP_DIR`, `YAYTD_DB_PASSWORD`, `YAYTD_ADMIN_PASSWORD`, `YAYTD_INSTALL_NGINX=yes`.

## Troubleshooting

### `npm ci` — package.json and package-lock.json out of sync

Your clone is behind `main`. Pull the latest lockfile, then redeploy:

```bash
cd ~/YTYD   # or your clone path
git pull origin main
git log -1 --oneline   # should be 2919148 or newer

sudo chown -R yaytd:yaytd /opt/yaytd
sudo ./install.sh --skip-packages
```

Or build only:

```bash
cd ~/YTYD && git pull origin main
sudo ./scripts/deploy-native.sh
```

Do **not** run bare `npx prisma` before `npm ci` — it may download the wrong Prisma version. Use `npm run db:migrate` after dependencies are installed.

**Requirements:** Node.js **20.19+** (22.x recommended), Prisma ORM **7** with PostgreSQL driver adapter.

### `P1000` — database authentication failed after redeploy

The installer previously rotated the PostgreSQL password but kept the old password in `.env`. Pull the latest installer, then either:

```bash
# Align Postgres with the password already in /opt/yaytd/.env
sudo ./scripts/repair-db-auth.sh
sudo -u yaytd env HOME=/opt/yaytd NPM_CONFIG_CACHE=/opt/yaytd/.cache/npm npm run db:migrate --prefix /opt/yaytd
```

Or use the password from the last `.install-secrets` (if `.env` is wrong):

```bash
sudo grep database_password /opt/yaytd/.install-secrets
# Update DATABASE_URL in /opt/yaytd/.env, then run repair-db-auth.sh
```

Redeploy without prompts:

```bash
git pull
sudo ./install.sh --skip-packages   # reuses /opt/yaytd/.env when install.conf is missing
```

## Legal

Users must only download content they are allowed to access. A terms checkbox is required before each download.
