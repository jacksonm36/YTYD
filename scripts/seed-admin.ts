import { ensureAdminUser } from "../src/lib/ensure-admin";

async function main() {
  try {
    await ensureAdminUser();
    console.log("Admin user ready.");
    console.log("⚠️  IMPORTANT: Change the admin password immediately after first login.");
  } catch (err) {
    if (err instanceof Error) {
      console.error("❌ Admin user initialization failed:", err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
