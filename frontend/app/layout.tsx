import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PWA } from "@/components/pwa";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
// Display face for the "grand marque" look — expanded caps via the variable width axis.
const display = Archivo({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["wdth"] });

export const metadata: Metadata = {
  title: "AutoValuate Intelligence — explainable car valuation",
  description: "Upload photos of a car, get an instant, explainable, damage-aware fair-market valuation for the UAE.",
  applicationName: "AutoValuate",
  appleWebApp: { capable: true, title: "AutoValuate", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1620" },
    { media: "(prefers-color-scheme: light)", color: "#f5f8fc" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <div className="ambient" aria-hidden>
            <span className="b1" />
            <span className="b2" />
          </div>
          <div className="grain" aria-hidden />
          {children}
          <PWA />
        </Providers>
      </body>
    </html>
  );
}
