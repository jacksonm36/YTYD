import { z } from "zod";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import { listAdminDbRows } from "@/lib/admin-db";
import { getAdminDbTable } from "@/lib/admin-db-registry";
import type { AdminDbTableId } from "@/lib/admin-db-registry";
import { apiError } from "@/lib/security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const { table } = await params;
    const def = getAdminDbTable(table);
    if (!def) return apiError("notFound", 404);

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(5, Number(url.searchParams.get("pageSize") ?? "25"))
    );
    const search = url.searchParams.get("search") ?? undefined;

    const result = await listAdminDbRows(table as AdminDbTableId, {
      page,
      pageSize,
      search,
    });

    return Response.json({
      table: def,
      page,
      pageSize,
      ...result,
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}
