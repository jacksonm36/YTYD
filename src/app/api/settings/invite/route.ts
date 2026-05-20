import { apiError } from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import {
  buildInviteRegisterUrl,
  getSiteInviteToken,
  regenerateInviteToken,
} from "@/lib/invites";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const token = await getSiteInviteToken();
    const locale =
      (session.user as { locale?: string })?.locale === "en" ? "en" : "hu";

    return Response.json({
      inviteToken: token,
      inviteUrl: buildInviteRegisterUrl(locale, token),
      inviteUrlHu: buildInviteRegisterUrl("hu", token),
      inviteUrlEn: buildInviteRegisterUrl("en", token),
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const token = await regenerateInviteToken();
    return Response.json({
      inviteToken: token,
      inviteUrl: buildInviteRegisterUrl("hu", token),
      inviteUrlHu: buildInviteRegisterUrl("hu", token),
      inviteUrlEn: buildInviteRegisterUrl("en", token),
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
