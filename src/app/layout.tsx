import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site-to-Agent",
  description: "Paste a website URL, get a grounded chat agent with citations in about a minute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
