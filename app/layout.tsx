import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "SparkPath",
  description:
    "Turn a child's obsessions into homework, reading and routines they want to do, and find the next obsession before boredom sets in.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffbf5" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${nunito.variable} min-h-dvh antialiased`}>{children}</body>
    </html>
  );
}
