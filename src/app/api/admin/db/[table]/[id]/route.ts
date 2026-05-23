import { z } from "zod";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { requireAdminRole } from "@/lib/require-admin";
import {
  deleteAdminDbRow,
  getAdminDbRow,
  updateAdminDbRow,
} from "@/lib/admin-db";
import { getAdminDbTable } from "@/lib/admin-db-registry";
import type { AdminDbTableId } from "@/lib/admin-db-registry";
import { apiError } from "@/lib/security";

const patchSchema = z.record(z.unknown());

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  try {
    const session = await requireApiSession(_request);
    await requireAdminRole(session);

    const { table, id } = await params;
    if (!getAdminDbTable(table)) return apiError("notFound", 404);

    const row = await getAdminDbRow(table as AdminDbTableId, id);
    if (!row) return apiError("notFound", 404);
    return Response.json({ row });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("generic", 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  try {
    const session = await requireApiSession(request);
    await requireAdminRole(session);

    const { table, id } = await params;
    const def = getAdminDbTable(table);
    if (!def) return apiError("notFound", 404);
    if (def.readOnly) return apiError("forbidden", 403);

    const body = patchSchema.parse(await request.json());
    const row = await updateAdminDbRow(
      table as AdminDbTableId,
      id,
      body as Record<string, unknown>
    );
    return Response.json({ row });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) return apiError("generic", 400);
    if (err instanceof Error) {
      if (err.message.includes("cannot")) return apiError("forbidden", 403);
    }
    return apiError("generic", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  try {
    const session = await requireApiSession(_request);
    await requireAdminRole(session);

    const { table, id } = await params;
    const def = getAdminDbTable(table);
    if (!def) return apiError("notFound", 404);
    if (!def.allowDelete) return apiError("forbidden", 403);

    await deleteAdminDbRow(table as AdminDbTableId, id);
    return Response.json({ ok: true });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof Error && err.message.includes("cannot")) {
      return apiError("forbidden", 403);
    }
    return apiError("generic", 500);
  }
}
