import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yet Another YouTube Downloader",
  description:
    "YAYTD — self-hosted multi-platform media downloader (YouTube, TikTok, Instagram, Facebook, and more)",
  generator: null,
  applicationName: "YAYTD",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
