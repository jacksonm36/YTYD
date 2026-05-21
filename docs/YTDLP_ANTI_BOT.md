# yt-dlp anti-bot setup (YouTube, TikTok, and others)

YAYTD passes optional flags to every `yt-dlp` probe and download. Configure them in `.env` on the server.

## Quick checklist (production server)

1. **Latest yt-dlp** — `pip install -U "yt-dlp[default]"` or the project install script.
2. **Deno 2.x** — required for YouTube JavaScript challenges ([EJS wiki](https://github.com/yt-dlp/yt-dlp/wiki/EJS)).
3. **Browser cookies** — Netscape `cookies.txt` for logged-in or age-gated content (YouTube, TikTok, Instagram).
4. **Restart** after changes: `npm run build && npm run start:prod:all`.

Worker startup logs anti-bot status in **Settings → Server monitor** (`Worker started` entry).

---

## 1. Deno (YouTube JS runtime)

YouTube now needs an external JS runtime. Without it, yt-dlp warns and may miss formats or hit bot checks.

```bash
# One-line install (official)
curl -fsSL https://deno.land/install.sh | sh
sudo ln -sf "$HOME/.deno/bin/deno" /usr/local/bin/deno
deno --version   # need >= 2.0
```

In `.env` (defaults applied by the app if unset):

```env
YTDLP_JS_RUNTIMES="deno,node"
YTDLP_REMOTE_COMPONENTS="ejs:github"
```

`node` is a fallback if Deno is missing. Prefer Deno on servers.

---

## 2. Cookies (all major platforms)

Many blocks are fixed by exporting **real browser cookies** while you are logged in.

1. Install a browser extension such as **Get cookies.txt LOCALLY** (Chrome/Firefox).
2. Open YouTube (or TikTok / Instagram) and sign in.
3. Export cookies in **Netscape** format.
4. On the server:

```bash
sudo mkdir -p /var/lib/yaytd/cookies
sudo cp cookies.txt /var/lib/yaytd/cookies/cookies.txt
sudo chown jackson:jackson /var/lib/yaytd/cookies/cookies.txt
chmod 600 /var/lib/yaytd/cookies/cookies.txt
```

5. In `.env`:

```env
YTDLP_COOKIES_FILE="/var/lib/yaytd/cookies/cookies.txt"
```

**Security:** treat this file like a password. Never commit it. Refresh every few weeks when downloads start failing.

| Platform | Cookies help with |
|----------|-------------------|
| YouTube | Bot check, age-restricted, members-only, some premium streams |
| TikTok | Login wall, region blocks, many “video unavailable” errors |
| Instagram | Private/login-only reels and posts |
| Twitter/X | Login-only media |

---

## 3. YouTube player clients (built-in default)

If `YTDLP_EXTRACTOR_ARGS` is empty, YAYTD uses:

```text
youtube:player_client=android_vr,web_safari,tv_embedded
```

- **android_vr** — often works without a PO token.
- **web_safari** — HLS formats, fewer GVS token issues.
- **tv_embedded** — fallback for embeddable videos.

To override:

```env
YTDLP_DEFAULT_YOUTUBE_CLIENTS="false"
YTDLP_EXTRACTOR_ARGS="youtube:player_client=mweb,web_safari"
```

---

## 4. YouTube PO token (advanced)

Some clients need a **Proof of Origin** token. Manual tokens expire quickly; use a **PO Token Provider plugin** when possible.

- Guide: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide  
- Plugins: https://github.com/topics/yt-dlp-pot-provider  

Optional env (single token string):

```env
YTDLP_YOUTUBE_PO_TOKEN="your-token-here"
```

---

## 5. TikTok-specific tips

- **Cookies** are the most reliable fix.
- If one region fails, try another API host via extractor args:

```env
YTDLP_EXTRACTOR_ARGS="tiktok:api_hostname=api22-normal-c-useast1a.tiktokv.com"
```

- Slight rate limiting can help on busy servers:

```env
YTDLP_SLEEP_REQUESTS="1"
```

---

## 6. Keep yt-dlp updated

YouTube changes often. Weekly:

```bash
sudo pip3 install -U "yt-dlp[default]"
/usr/local/bin/yt-dlp -U   # if using standalone binary
```

---

## 7. All supported `.env` variables

| Variable | Purpose |
|----------|---------|
| `YTDLP_COOKIES_FILE` | Path to Netscape cookies.txt |
| `YTDLP_JS_RUNTIMES` | e.g. `deno,node` or `deno:/usr/local/bin/deno` |
| `YTDLP_REMOTE_COMPONENTS` | e.g. `ejs:github` for pip installs |
| `YTDLP_DEFAULT_YOUTUBE_CLIENTS` | `true` = android_vr + web_safari clients |
| `YTDLP_EXTRACTOR_ARGS` | Semicolon-separated `IE_KEY:args` |
| `YTDLP_YOUTUBE_PO_TOKEN` | Optional PO token for YouTube |
| `YTDLP_SLEEP_REQUESTS` | Seconds between HTTP requests (0 = off) |
| `YTDLP_USER_AGENT` | Custom User-Agent (rarely needed) |

---

## 8. Verify on the server

```bash
yt-dlp --verbose --dump-single-json --no-download "https://www.youtube.com/watch?v=jNQXAC9IVRw" 2>&1 | grep -E 'JS runtimes|PO Token|cookies'
```

You want `deno` (or `node`) listed under JS runtimes, not `none`.

Test with your cookies:

```bash
yt-dlp --cookies /var/lib/yaytd/cookies/cookies.txt --dump-single-json --no-download "YOUR_URL"
```
