import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppShell, DemoGate } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CaseFlow — SmileCare Dental (Demo)", template: "%s · CaseFlow" },
  description: "Recover treatment patients haven't scheduled yet. Demo with synthetic data.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f6f5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <AppShell>
          <DemoGate>{children}</DemoGate>
        </AppShell>
      </body>
    </html>
  );
}
