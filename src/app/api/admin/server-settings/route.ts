import { z } from "zod";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import { apiError } from "@/lib/security";
import {
  getEffectiveSettings,
  resetServerSetting,
  saveServerSettings,
} from "@/lib/runtime-settings";
import {
  SERVER_SETTING_DEFINITIONS,
  SERVER_SETTING_KEYS,
} from "@/lib/server-settings-registry";

const patchSchema = z.object({
  settings: z.record(z.string()).optional(),
  resetKeys: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const effective = await getEffectiveSettings();
    return Response.json({
      definitions: SERVER_SETTING_DEFINITIONS,
      effective,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const body = patchSchema.parse(await request.json());

    if (body.resetKeys?.length) {
      for (const key of body.resetKeys) {
        if (SERVER_SETTING_KEYS.has(key)) {
          await resetServerSetting(key);
        }
      }
    }

    if (body.settings && Object.keys(body.settings).length > 0) {
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.settings)) {
        if (SERVER_SETTING_KEYS.has(key)) {
          filtered[key] = String(value);
        }
      }
      await saveServerSettings(filtered, session.user!.id!);
    }

    const effective = await getEffectiveSettings();
    return Response.json({ effective });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) return apiError("generic", 400);
    if (err instanceof Error && err.message.includes("invalid")) {
      return apiError("generic", 400);
    }
    return apiError("generic", 500);
  }
}
