import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-studio-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-studio-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TaVi AI Montage Studio",
  description:
    "Завантаж ігрові моменти MLBB та створи вертикальний AI-монтаж для TikTok, Shorts і Reels.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body
        className={`${inter.variable} ${robotoMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
