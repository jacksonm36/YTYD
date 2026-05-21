# Yet Another YouTube Downloader (YAYTD)

**YAYTD** is the short name for **Yet Another YouTube Downloader** — a secure, self-hosted media downloader. Paste a link from **YouTube, TikTok, Instagram, Facebook, X, Vimeo, Reddit, Twitch**, and more, pick a format, and save to your device. Powered by **yt-dlp**, **Next.js**, **Auth.js**, **PostgreSQL**, and **Redis** (BullMQ).

**Repository:** [github.com/jacksonm36/YTYD](https://github.com/jacksonm36/YTYD) · **Install guide:** [INSTALL.md](INSTALL.md)

Runs **natively on Linux** (no Docker). HTTPS is terminated at your **reverse proxy**; the Node app listens on `http://127.0.0.1:3000`.

## Supported platforms

| Platform | Examples |
|----------|----------|
| YouTube | Videos, Shorts, Music |
| TikTok | Videos |
| Instagram | Reels, posts |
| Facebook | Videos, Watch |
| X (Twitter) | Posts with video |
| Vimeo, Reddit, Twitch, Dailymotion, Pinterest, LinkedIn, SoundCloud | Public media URLs |

Downloads use [yt-dlp](https://github.com/yt-dlp/yt-dlp). Private or login-only content may fail unless you configure cookies on the server (not included by default).

## Features

- Multi-platform probe and download (video + audio / MP3)
- Invite-only registration + admin approval
- Login history with GeoIP (MaxMind, optional)
- Hungarian (default) and English UI
- Redis job queue for parallel downloads

## Quick install (from GitHub)

```bash
git clone https://github.com/jacksonm36/YTYD.git
cd YTYD
chmod +x install.sh
sudo ./install.sh
```

Or from an existing clone:

```bash
chmod +x install.sh scripts/install.sh
sudo ./install.sh
```

The wizard asks for (press Enter for defaults):

| Setting | Default |
|---------|---------|
| Public domain | `yaytd.example.com` (your real hostname) |
| HTTPS public URL | `https://<domain>` |
| App directory | `/opt/yaytd` |
| Data directory | `/var/lib/yaytd/downloads` |
| System user | `yaytd` |
| Listen port | `3000` |
| DB name / user / host / port | `yaytd` @ `127.0.0.1:5432` |
| Redis URL | `redis://127.0.0.1:6379` |
| Admin password | random (saved in `.install-secrets`) |
| Install systemd | yes |
| Install nginx site file | no (use your own proxy if you prefer) |

It then runs **everything**: apt packages (Node 22, PostgreSQL, Redis, ffmpeg, yt-dlp), database setup, full `.env`, `npm ci` + build, Prisma migrate + seed, **generated systemd units** (paths match your choices), optional nginx config, and starts services.

### Non-interactive / fast install

```bash
# Defaults + auto-generated secrets
sudo ./scripts/install.sh -y

# Fully unattended (secrets auto-generated if omitted)
sudo YAYTD_DOMAIN=yaytd.example.com \
     ./scripts/install.sh --non-interactive
```

More env vars: `YAYTD_APP_DIR`, `YAYTD_DATA_DIR`, `YAYTD_DB_NAME`, `YAYTD_DB_USER`, `YAYTD_DB_HOST`, `YAYTD_PORT`, `YAYTD_REDIS_URL`, `YAYTD_INSTALL_NGINX=yes`, `YAYTD_SKIP_PACKAGES=1`, `YAYTD_SKIP_BUILD=1`

Config is saved to `/opt/yaytd/install.conf` for reference.

### After install

| Item | Value |
|------|--------|
| Public URL | `https://<your-domain>` (set in `.env` via install) |
| Upstream | `http://127.0.0.1:3000` |
| Admin | `admin` / password in `/opt/yaytd/.install-secrets` — **change after first login** |
| Invite link | Settings → copy HU/EN registration URL |

```bash
sudo systemctl status yaytd yaytd-worker
sudo journalctl -u yaytd -f
```

### Reverse proxy

TLS and certificates stay on the proxy. Required headers to the app:

| Header | Value |
|--------|--------|
| `Host` | your domain |
| `X-Forwarded-Proto` | `https` |
| `X-Forwarded-For` | client IP |
| `X-Real-IP` | client IP |

Example: [`deploy/nginx-yaytd.conf`](deploy/nginx-yaytd.conf)

Set in `.env`: `TRUST_PROXY=true`, all `*_URL` vars to your public HTTPS URL.

## Development

**Automated (from clone, uses PostgreSQL + Redis on this machine):**

```bash
sudo YAYTD_APP_DIR="$PWD" YAYTD_DEV_INSTALL=1 ./scripts/install.sh -y
npm run dev:all   # web + worker
```

This writes `.env`, `.env.local` (localhost + `/tmp/yaytd-downloads`), and keeps files owned by your user (not `root` / `yaytd` only).

**Manual:**

```bash
cp .env.example .env
cp .env.local.example .env.local
# Edit DATABASE_URL, AUTH_SECRET, REDIS_URL in .env
npm install
npx prisma migrate deploy
npm run db:seed-admin
npm run dev:all   # web + worker
```

Open `http://localhost:3000/hu`

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL (`yaytd` user/db) |
| `AUTH_SECRET` | Session signing (install generates randomly) |
| `DOWNLOAD_TOKEN_SECRET` | One-time file download JWTs |
| `APP_URL` / `AUTH_URL` / `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | Public HTTPS URL |
| `TEMP_DOWNLOAD_DIR` | Default `/var/lib/yaytd/downloads` |
| `REDIS_URL` | BullMQ (`redis://127.0.0.1:6379`) |
| `TRUST_PROXY` | `true` behind reverse proxy |
| `MAXMIND_LICENSE_KEY` | Optional GeoIP for login history |
| `QUEUE_CONCURRENCY` | Parallel yt-dlp workers |

## Systemd units

| Service | Role |
|---------|------|
| `yaytd` | Next.js UI + API |
| `yaytd-worker` | Redis / yt-dlp worker |

## Legal

Users must only download content they have the right to access. A terms checkbox is required before each download.

## Project structure

```
src/           Next.js app, API, auth
scripts/       install.sh, worker, seed
deploy/        systemd + nginx examples
prisma/        schema and migrations
messages/      hu.json, en.json
```
