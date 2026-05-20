import { setRequestLocale } from "next-intl/server";
import { requireAuth } from "@/lib/require-auth";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAuth(locale);

  return <SettingsForm />;
}
