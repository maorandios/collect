import type { Metadata } from "next";
import { Heebo } from "next/font/google";

import { Providers } from "@/components/providers";
import { he } from "@/lib/i18n/he";

import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
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
      className={`${heebo.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex h-full min-h-dvh flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
