import { ensureAdminUser } from "../src/lib/ensure-admin";

async function main() {
  await ensureAdminUser();
  console.log("Admin user ready (username: admin, default password: admin)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
