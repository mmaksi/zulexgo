import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// design-standard.md §3.1 — load only 300, 600 italic (wordmark) and 800 (H1).
const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "800"],
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
  description: "Fahrzeug online abmelden — schnell, sicher, offiziell.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={cn("h-full", "antialiased", kanit.variable, kanitWordmark.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
