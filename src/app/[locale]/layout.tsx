import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
import { ProvidersWrapper } from "./providers-wrapper";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "hu" | "en")) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <ProvidersWrapper>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
            {children}
          </main>
        </div>
      </ProvidersWrapper>
    </NextIntlClientProvider>
  );
}
