"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
} from "@/lib/api-client";

type TableDef = {
  id: string;
  label: string;
  readOnly: boolean;
  allowDelete: boolean;
  editableFields: string[];
};

export function AdminDatabaseConsole() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [tables, setTables] = useState<TableDef[]>([]);
  const [selected, setSelected] = useState<string>("User");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editJson, setEditJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tableDef = tables.find((tb) => tb.id === selected);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadTables = useCallback(async () => {
    const data = await apiGet<{ tables: TableDef[] }>("/api/admin/db/tables");
    setTables(data.tables);
  }, []);

  const loadRows = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) q.set("search", search.trim());
      const data = await apiGet<{
        rows: Record<string, unknown>[];
        total: number;
        table: TableDef;
      }>(`/api/admin/db/${selected}?${q}`);
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.code : "generic"
      );
    } finally {
      setLoading(false);
    }
  }, [selected, page, search]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openEdit = (row: Record<string, unknown>) => {
    if (!tableDef || tableDef.readOnly) return;
    const subset: Record<string, unknown> = { id: row.id };
    for (const field of tableDef.editableFields) {
      if (row[field] !== undefined) subset[field] = row[field];
    }
    if (selected === "ServerSetting") {
      subset.key = row.key;
      subset.value = row.value;
    }
    setEditRow(row);
    setEditJson(JSON.stringify(subset, null, 2));
  };

  const saveEdit = async () => {
    if (!editRow || !tableDef) return;
    setError(null);
    try {
      const parsed = JSON.parse(editJson) as Record<string, unknown>;
      const id = String(
        selected === "ServerSetting" ? parsed.key ?? editRow.key : editRow.id
      );
      delete parsed.id;
      if (selected === "ServerSetting") delete parsed.key;
      await apiPatch(`/api/admin/db/${selected}/${encodeURIComponent(id)}`, parsed);
      setMessage(t("dbRowSaved"));
      setEditRow(null);
      void loadRows();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.code : "generic"
      );
    }
  };

  const deleteRow = async (row: Record<string, unknown>) => {
    if (!tableDef?.allowDelete) return;
    const id = String(
      selected === "ServerSetting" ? row.key : row.id
    );
    if (!confirm(t("dbDeleteConfirm"))) return;
    try {
      await apiDelete(
        `/api/admin/db/${selected}/${encodeURIComponent(id)}`
      );
      setMessage(t("dbRowDeleted"));
      void loadRows();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.code : "generic"
      );
    }
  };

  const columns =
    rows.length > 0
      ? Object.keys(rows[0]).filter((k) => k !== "passwordHash").slice(0, 8)
      : [];

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-[var(--card)] p-4">
      <p className="text-xs text-amber-200/90">{t("dbConsoleWarning")}</p>

      <div className="flex flex-wrap gap-2">
        {tables.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => {
              setSelected(tb.id);
              setPage(1);
              setEditRow(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              selected === tb.id
                ? "border-[var(--accent)] bg-[var(--accent)]/15"
                : "border-[var(--border)]"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dbSearch")}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void loadRows();
          }}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm"
        >
          {t("dbRefresh")}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">{tCommon("loading")}</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--border)]/40">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-2 py-2 font-medium whitespace-nowrap">
                    {col}
                  </th>
                ))}
                <th className="px-2 py-2">{t("dbActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = String(row.id ?? row.key);
                return (
                  <tr
                    key={rowKey}
                    className="border-t border-[var(--border)] hover:bg-[var(--border)]/20"
                  >
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-2 py-2 max-w-[12rem] truncate font-mono"
                        title={String(row[col] ?? "")}
                      >
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                    <td className="px-2 py-2 whitespace-nowrap space-x-2">
                      {!tableDef?.readOnly && (
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {t("dbEdit")}
                        </button>
                      )}
                      {tableDef?.allowDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteRow(row)}
                          className="text-red-400 hover:underline"
                        >
                          {t("dbDelete")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <span>
          {t("dbPageInfo", { page, totalPages, total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border border-[var(--border)] disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded border border-[var(--border)] disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      {editRow && (
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <p className="text-sm font-medium">{t("dbEditRow")}</p>
          <p className="text-xs text-[var(--muted)]">
            {t("dbEditableFields")}: {tableDef?.editableFields.join(", ")}
          </p>
          <textarea
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            rows={8}
            className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm"
            >
              {tCommon("save")}
            </button>
            <button
              type="button"
              onClick={() => setEditRow(null)}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
