import { getCanonicalAppBaseUrl } from "@/lib/app-origin";

const REPO = "https://github.com/jacksonm36/YTYD";
const DEFAULT_CONTACT = `${REPO}/security/advisories`;
const DEFAULT_POLICY = `${REPO}/blob/main/SECURITY.md`;

/** RFC 9116 security.txt body (https://securitytxt.org). */
export function buildSecurityTxt(): string {
  const base = getCanonicalAppBaseUrl();
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  expires.setUTCHours(23, 59, 59, 0);

  let contact = DEFAULT_CONTACT;
  const explicit = process.env.SECURITY_CONTACT?.trim();
  const email = process.env.SECURITY_EMAIL?.trim();
  if (explicit) {
    contact = explicit;
  } else if (email) {
    contact = `mailto:${email}`;
  }

  const policy = process.env.SECURITY_POLICY?.trim() || DEFAULT_POLICY;

  const lines = [
    `# Yet Another YouTube Downloader (YAYTD)`,
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString()}`,
    `Preferred-Languages: en, hu`,
    `Canonical: ${base}/.well-known/security.txt`,
    `Policy: ${policy}`,
  ];

  const encryption = process.env.SECURITY_ENCRYPTION?.trim();
  if (encryption) {
    lines.push(`Encryption: ${encryption}`);
  }

  const acknowledgments = process.env.SECURITY_ACKNOWLEDGMENTS?.trim();
  if (acknowledgments) {
    lines.push(`Acknowledgments: ${acknowledgments}`);
  }

  return `${lines.join("\n")}\n`;
}
