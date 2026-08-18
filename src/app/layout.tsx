import type { Metadata } from "next";
import localFont from "next/font/local";

import { Providers } from "@/components/providers";
import { he } from "@/lib/i18n/he";

import "./globals.css";

const googleSans = localFont({
  src: "../fonts/google-sans/GoogleSans-Variable.ttf",
  variable: "--font-google-sans",
  display: "swap",
  weight: "100 900",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: he.metadata.title,
  description: he.metadata.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${googleSans.variable} ${googleSans.className} h-full`}
      suppressHydrationWarning
    >
      <body className="flex h-full min-h-dvh flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
