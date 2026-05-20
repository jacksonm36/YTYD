import { z } from "zod";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/security";

const schema = z.object({
  email: z.string().email(),
});

/** Pre-check rate limit before Auth.js credentials sign-in */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    await checkRateLimit({ action: "login", ipHash: hashIp(ip) });
    schema.parse(await request.json());
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "rateLimited") {
      return Response.json({ error: "rateLimited" }, { status: 429 });
    }
    return Response.json({ ok: true });
  }
}
