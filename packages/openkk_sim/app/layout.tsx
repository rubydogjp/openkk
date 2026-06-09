import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "@rubydogjp/openkk-client/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const notoSansJp = localFont({
  src: "./fonts/NotoSansJP-VariableFont_wght.ttf",
  variable: "--font-sans",
  display: "swap",
});
const notoSansMono = localFont({
  src: "./fonts/NotoSansMono-VariableFont_wdth,wght.ttf",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "オープン会計",
  description: "個人事業主向けオープンソース複式簿記アプリ",

  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} ${notoSansMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
