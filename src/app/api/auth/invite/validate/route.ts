import { isValidInviteToken } from "@/lib/invites";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const valid = await isValidInviteToken(token);
  return Response.json({ valid });
}
