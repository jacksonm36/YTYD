import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

/** Load `.env` then `.env.local` (local overrides) before reading `config`. */
export function loadProjectEnv(): void {
  const root = process.cwd();
  const env = resolve(root, ".env");
  const local = resolve(root, ".env.local");
  if (existsSync(env)) loadEnv({ path: env });
  if (existsSync(local)) loadEnv({ path: local, override: true });
}

loadProjectEnv();
