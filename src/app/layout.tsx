import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YAYTD — Yet Another YouTube Downloader",
  description: "Multi-platform video downloader: YouTube, TikTok, Instagram, Facebook, and more",
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
