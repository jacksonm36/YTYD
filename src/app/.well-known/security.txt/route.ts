import { buildSecurityTxt } from "@/lib/security-txt";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(buildSecurityTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
