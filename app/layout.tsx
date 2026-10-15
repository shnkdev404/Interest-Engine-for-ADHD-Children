import type { Metadata, Viewport } from "next";

// Self-hosted from npm: builds never depend on fetching Google Fonts.
import "@fontsource-variable/inter";
import "@fontsource-variable/nunito";
import "./globals.css";

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
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
