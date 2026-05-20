"use client";

type ApiErrorBody = { error?: string };

export class ApiClientError extends Error {
  constructor(
    public code: string,
    public status: number
  ) {
    super(code);
  }
}

/**
 * Authenticated fetch — sends session cookie, JSON headers, same-origin credentials.
 */
export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      const locale = window.location.pathname.match(/^\/(hu|en)/)?.[1] ?? "hu";
      if (!window.location.pathname.includes("/login")) {
        window.location.href = `/${locale}/login?expired=1`;
      }
    }
    throw new ApiClientError(data.error ?? "generic", res.status);
  }

  return data;
}

export function apiGet<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "GET" });
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** One-time Bearer token + blob download (token never placed in URL/query). */
export async function triggerSecureDownload(jobId: string): Promise<void> {
  const data = await apiPost<{ token: string; fileName?: string }>(
    `/api/download/${jobId}/download-url`,
    {}
  );

  const res = await fetch(`/api/download/${jobId}/file`, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Authorization: `Bearer ${data.token}`,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiClientError(body.error ?? "generic", res.status);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download =
    parseFilenameFromDisposition(res.headers.get("Content-Disposition")) ??
    data.fileName ??
    "download";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
