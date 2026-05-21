import { ServerResponse } from "http";
import {
  shouldRemoveFingerprintHeader,
} from "./strip-response-fingerprint";

const VARY_FINGERPRINTS = new Set([
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
]);

function sanitizeVaryValue(value: string): string | undefined {
  const kept = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !VARY_FINGERPRINTS.has(part));
  return kept.length > 0 ? kept.join(", ") : undefined;
}

function filterHeaderValue(
  name: string,
  value: string | number | readonly string[]
): string | number | readonly string[] | undefined {
  if (shouldRemoveFingerprintHeader(name)) {
    return undefined;
  }
  if (name.toLowerCase() === "vary" && typeof value === "string") {
    return sanitizeVaryValue(value);
  }
  return value;
}

function filterHeadersObject(
  headers: Record<string, string | number | readonly string[] | undefined>
): Record<string, string | number | readonly string[] | undefined> {
  const out: Record<string, string | number | readonly string[] | undefined> =
    {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const filtered = filterHeaderValue(name, value);
    if (filtered !== undefined) {
      out[name] = filtered;
    }
  }
  return out;
}

let installed = false;

/** Block framework fingerprint headers at the Node HTTP layer (production). */
export function installResponseHeaderFingerprintGuard(): void {
  if (installed || process.env.NODE_ENV !== "production") return;
  installed = true;

  const proto = ServerResponse.prototype as ServerResponse & {
    setHeader: ServerResponse["setHeader"];
    appendHeader?: ServerResponse["appendHeader"];
    writeHead: ServerResponse["writeHead"];
  };

  const originalSetHeader = proto.setHeader;
  proto.setHeader = function (name, value, ...rest) {
    const filtered = filterHeaderValue(String(name), value);
    if (filtered === undefined) {
      return this;
    }
    return originalSetHeader.call(
      this,
      name,
      filtered as string | number | readonly string[],
      ...rest
    );
  };

  if (typeof proto.appendHeader === "function") {
    const originalAppendHeader = proto.appendHeader;
    proto.appendHeader = function (name, value) {
      const filtered = filterHeaderValue(String(name), value);
      if (filtered === undefined) {
        return this;
      }
      return originalAppendHeader.call(
        this,
        name,
        filtered as string | readonly string[]
      );
    };
  }

  const originalWriteHead = proto.writeHead;
  proto.writeHead = function (
    this: ServerResponse,
    statusCode: number,
    ...args: unknown[]
  ) {
    if (args.length === 0) {
      return originalWriteHead.call(this, statusCode);
    }

    const first = args[0];
    if (typeof first === "object" && first !== null && !Array.isArray(first)) {
      const headers = filterHeadersObject(
        first as Record<string, string | number | readonly string[] | undefined>
      );
      return originalWriteHead.apply(this, [statusCode, headers, ...args.slice(1)] as never);
    }

    if (
      args.length >= 2 &&
      typeof args[1] === "object" &&
      args[1] !== null &&
      !Array.isArray(args[1])
    ) {
      const headers = filterHeadersObject(
        args[1] as Record<string, string | number | readonly string[] | undefined>
      );
      return originalWriteHead.apply(this, [
        statusCode,
        first,
        headers,
        ...args.slice(2),
      ] as never);
    }

    return originalWriteHead.apply(this, [statusCode, ...args] as never);
  };
}
