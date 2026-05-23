# Security policy

## Reporting a vulnerability

If you believe you found a security issue in **YAYTD** (Yet Another YouTube Downloader), please report it responsibly.

**You do not need to know the operator’s personal email.** Use any of these:

1. **[GitHub Security Advisories](https://github.com/jacksonm36/YTYD/security/advisories)** (preferred for this repository) — private report, no public disclosure until fixed.
2. **`/.well-known/security.txt`** on a running instance — lists the current `Contact` and `Policy` URLs for that deployment.
3. **Optional operator contact** — if the deployer set `SECURITY_CONTACT` or `SECURITY_EMAIL` in `.env`, that address appears in `security.txt` (often a role address like `security@your-domain`, not a personal inbox).

Please include:

- What you found and where (URL, API route, version/commit if known)
- Steps to reproduce
- Impact (data exposure, auth bypass, RCE, etc.)

Please **do not** open a public GitHub issue for exploitable vulnerabilities before a fix is available.

## Scope

In scope:

- This application (Next.js app, API routes, auth, download pipeline, admin features)
- Default deployment scripts in this repository

Out of scope:

- Vulnerabilities in **yt-dlp**, **nginx**, **PostgreSQL**, or **Redis** themselves (report to those projects)
- Social engineering, physical access, or issues that require a compromised admin account
- Denial of service from normal download load

## Operator configuration (self-hosted)

Deployers can customize `/.well-known/security.txt` via `.env` (all optional):

| Variable | Purpose |
|----------|---------|
| `SECURITY_CONTACT` | Full `Contact` line value, e.g. `mailto:security@example.com` or `https://example.com/security` |
| `SECURITY_EMAIL` | Shorthand; becomes `mailto:…` (use a role alias, not required to be personal) |
| `SECURITY_POLICY` | URL to your own security policy page |
| `SECURITY_ENCRYPTION` | URL to a PGP key |
| `SECURITY_ACKNOWLEDGMENTS` | URL to a thanks / hall-of-fame page |

If unset, defaults point to this repo’s GitHub Security Advisories and this file.

## Safe harbor

We appreciate good-faith research. Do not access other users’ data, disrupt production, or exceed what is needed to demonstrate the issue.
