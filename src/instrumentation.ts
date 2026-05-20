export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateProductionConfig } = await import(
      "@/lib/production-guard"
    );
    validateProductionConfig();
    const { ensureAdminUser } = await import("@/lib/ensure-admin");
    await ensureAdminUser();
  }
}
