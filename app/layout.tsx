import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { cn } from "@/src/lib/utils";

// design-standard.md §3.1 — load only 300, 400 (text below 16px), 600 (the
// plate fallback while Euro Plate is unlicensed), 600 italic (wordmark) and 800 (H1).
const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "400", "600", "800"],
  display: "swap",
  variable: "--font-kanit",
});

const kanitWordmark = Kanit({
  subsets: ["latin"],
  weight: "600",
  style: "italic",
  display: "swap",
  variable: "--font-kanit-wordmark",
});

export const metadata: Metadata = {
  title: "ZulexGO",
  description: "Fahrzeug online an- und abmelden — schnell, sicher, offiziell.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // site-contract §3: in-page anchors scroll smoothly (off under reduced motion, globals.css); Next keeps route changes instant.
    <html
      lang="de"
      data-scroll-behavior="smooth"
      className={cn("h-full", "scroll-smooth", "antialiased", kanit.variable, kanitWordmark.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
