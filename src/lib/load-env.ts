import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

/** Load `.env` and dev-only overrides before reading `config` (worker/scripts). */
export function loadProjectEnv(): void {
  const root = process.cwd();
  const env = resolve(root, ".env");
  if (existsSync(env)) loadEnv({ path: env });

  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "production") {
    const devLocal = resolve(root, ".env.development.local");
    if (existsSync(devLocal)) loadEnv({ path: devLocal, override: true });
  }
}

loadProjectEnv();
