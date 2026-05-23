import { prisma } from "@/lib/prisma";
import type { AdminDbTableId } from "@/lib/admin-db-registry";
import { getAdminDbTable } from "@/lib/admin-db-registry";

function serializeRow(
  row: Record<string, unknown>,
  hidden: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (hidden.includes(k)) continue;
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (typeof v === "bigint") {
      out[k] = v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function pickEditable(
  data: Record<string, unknown>,
  editable: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of editable) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

export async function listAdminDbRows(
  tableId: AdminDbTableId,
  options: { page: number; pageSize: number; search?: string }
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const def = getAdminDbTable(tableId);
  if (!def) throw new Error("unknown table");

  const skip = (options.page - 1) * options.pageSize;
  const take = options.pageSize;
  const q = options.search?.trim();

  switch (tableId) {
    case "User": {
      const where = q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { username: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where }),
      ]);
      return {
        rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>, def.hiddenFields)),
        total,
      };
    }
    case "DownloadJob": {
      const where = q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { url: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
      const [rows, total] = await Promise.all([
        prisma.downloadJob.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { email: true, username: true } } },
        }),
        prisma.downloadJob.count({ where }),
      ]);
      return {
        rows: rows.map((r) => {
          const base = serializeRow(
            r as unknown as Record<string, unknown>,
            def.hiddenFields
          );
          return {
            ...base,
            userEmail: r.user.email,
            userUsername: r.user.username,
          };
        }),
        total,
      };
    }
    case "SiteConfig": {
      const rows = await prisma.siteConfig.findMany({ skip, take });
      const total = await prisma.siteConfig.count();
      return {
        rows: rows.map((r) =>
          serializeRow(r as unknown as Record<string, unknown>, def.hiddenFields)
        ),
        total,
      };
    }
    case "ServerSetting": {
      const rows = await prisma.serverSetting.findMany({
        skip,
        take,
        orderBy: { key: "asc" },
      });
      const total = await prisma.serverSetting.count();
      return {
        rows: rows.map((r) =>
          serializeRow(r as unknown as Record<string, unknown>, def.hiddenFields)
        ),
        total,
      };
    }
    case "SystemLog": {
      const where = q
        ? { message: { contains: q, mode: "insensitive" as const } }
        : {};
      const [rows, total] = await Promise.all([
        prisma.systemLog.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        prisma.systemLog.count({ where }),
      ]);
      return {
        rows: rows.map((r) =>
          serializeRow(r as unknown as Record<string, unknown>, def.hiddenFields)
        ),
        total,
      };
    }
    case "LoginEvent": {
      const [rows, total] = await Promise.all([
        prisma.loginEvent.findMany({
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { email: true } } },
        }),
        prisma.loginEvent.count(),
      ]);
      return {
        rows: rows.map((r) => ({
          ...serializeRow(
            r as unknown as Record<string, unknown>,
            def.hiddenFields
          ),
          userEmail: r.user?.email ?? null,
        })),
        total,
      };
    }
    case "RateLimitEvent": {
      const [rows, total] = await Promise.all([
        prisma.rateLimitEvent.findMany({
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        prisma.rateLimitEvent.count(),
      ]);
      return {
        rows: rows.map((r) =>
          serializeRow(r as unknown as Record<string, unknown>, def.hiddenFields)
        ),
        total,
      };
    }
    default:
      throw new Error("unknown table");
  }
}

export async function getAdminDbRow(
  tableId: AdminDbTableId,
  id: string
): Promise<Record<string, unknown> | null> {
  const def = getAdminDbTable(tableId);
  if (!def) throw new Error("unknown table");

  switch (tableId) {
    case "User": {
      const row = await prisma.user.findUnique({ where: { id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    case "DownloadJob": {
      const row = await prisma.downloadJob.findUnique({ where: { id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    case "SiteConfig": {
      const row = await prisma.siteConfig.findUnique({ where: { id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    case "ServerSetting": {
      const row = await prisma.serverSetting.findUnique({ where: { key: id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    case "SystemLog": {
      const row = await prisma.systemLog.findUnique({ where: { id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    case "LoginEvent": {
      const row = await prisma.loginEvent.findUnique({ where: { id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    case "RateLimitEvent": {
      const row = await prisma.rateLimitEvent.findUnique({ where: { id } });
      return row
        ? serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields)
        : null;
    }
    default:
      return null;
  }
}

export async function updateAdminDbRow(
  tableId: AdminDbTableId,
  id: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const def = getAdminDbTable(tableId);
  if (!def || def.readOnly) throw new Error("read only");
  const patch = pickEditable(data, def.editableFields);
  if (Object.keys(patch).length === 0) throw new Error("no fields");

  if (tableId === "User" && patch.role === "admin") {
    /* allowed */
  }
  if (tableId === "User" && patch.role !== "admin") {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { username: true },
    });
    if (target?.username === "admin") {
      throw new Error("cannot demote primary admin");
    }
  }

  switch (tableId) {
    case "User": {
      const row = await prisma.user.update({ where: { id }, data: patch });
      return serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields);
    }
    case "DownloadJob": {
      const row = await prisma.downloadJob.update({ where: { id }, data: patch });
      return serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields);
    }
    case "SiteConfig": {
      const row = await prisma.siteConfig.update({ where: { id }, data: patch });
      return serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields);
    }
    case "ServerSetting": {
      const row = await prisma.serverSetting.update({
        where: { key: id },
        data: patch as { value: string },
      });
      const { reloadRuntimeSettings } = await import("@/lib/runtime-settings");
      await reloadRuntimeSettings();
      return serializeRow(row as unknown as Record<string, unknown>, def.hiddenFields);
    }
    default:
      throw new Error("read only");
  }
}

export async function deleteAdminDbRow(
  tableId: AdminDbTableId,
  id: string
): Promise<void> {
  const def = getAdminDbTable(tableId);
  if (!def?.allowDelete) throw new Error("delete not allowed");

  if (tableId === "User") {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { username: true, role: true },
    });
    if (user?.username === "admin" || user?.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) throw new Error("cannot delete last admin");
    }
  }

  switch (tableId) {
    case "User":
      await prisma.user.delete({ where: { id } });
      break;
    case "DownloadJob":
      await prisma.downloadJob.delete({ where: { id } });
      break;
    case "ServerSetting": {
      await prisma.serverSetting.delete({ where: { key: id } });
      const { reloadRuntimeSettings } = await import("@/lib/runtime-settings");
      await reloadRuntimeSettings();
      break;
    }
    case "SystemLog":
      await prisma.systemLog.delete({ where: { id } });
      break;
    case "LoginEvent":
      await prisma.loginEvent.delete({ where: { id } });
      break;
    case "RateLimitEvent":
      await prisma.rateLimitEvent.delete({ where: { id } });
      break;
    default:
      throw new Error("delete not allowed");
  }
}
