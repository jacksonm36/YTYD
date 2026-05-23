import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import { ADMIN_DB_TABLES } from "@/lib/admin-db-registry";
import { apiError } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);
    return Response.json({ tables: ADMIN_DB_TABLES });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
