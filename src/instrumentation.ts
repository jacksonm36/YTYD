export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installResponseHeaderFingerprintGuard } = await import(
      "@/lib/response-header-guard"
    );
    installResponseHeaderFingerprintGuard();

    const { validateProductionConfig } = await import(
      "@/lib/production-guard"
    );
    validateProductionConfig();
    const { ensureAdminUser } = await import("@/lib/ensure-admin");
    await ensureAdminUser();
  }
}
