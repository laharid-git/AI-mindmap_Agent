import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mind-Map Agent",
  description:
    "A multi-agent AI system that explores, challenges, critiques, and refines mind maps - built for a Master's UX/AI design course.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased dark:bg-ink-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
