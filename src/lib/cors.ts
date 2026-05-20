import { getAllowedOrigins } from "@/lib/app-origin";

/**
 * Same-origin app: CORS is only set when the request Origin is on the allowlist
 * (e.g. alternate hostname). Cross-origin API calls from unknown sites are blocked.
 */
export function applyCorsHeaders(
  request: Request,
  response: Response
): Response {
  const origin = request.headers.get("origin");
  if (!origin) return response;

  const allowed = getAllowedOrigins();
  let allowedOrigin: string | null = null;
  try {
    if (allowed.includes(new URL(origin).origin)) {
      allowedOrigin = origin;
    }
  } catch {
    return response;
  }

  if (!allowedOrigin) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflightResponse(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;

  const origin = request.headers.get("origin");
  if (!origin) {
    return new Response(null, { status: 204 });
  }

  const allowed = getAllowedOrigins();
  try {
    if (!allowed.includes(new URL(origin).origin)) {
      return new Response(null, { status: 403 });
    }
  } catch {
    return new Response(null, { status: 403 });
  }

  return applyCorsHeaders(
    request,
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Max-Age": "86400",
      },
    })
  );
}
