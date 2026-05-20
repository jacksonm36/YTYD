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
sudo YAYTD_DOMAIN=letolto.gamedns.hu ./install.sh --non-interactive
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

## Legal

Users must only download content they are allowed to access. A terms checkbox is required before each download.
