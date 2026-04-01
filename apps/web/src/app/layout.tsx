import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

export const metadata: Metadata = {
  title: "crypto-ai",
  description: "Frontend for crypto-ai analytics platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <div className="shell">
          <header className="header">
            <div className="header-inner">
              <Link className="brand" href="/dashboard">
                crypto-<span>ai</span>
              </Link>

              <nav className="nav">
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/markets">Markets</Link>
              </nav>
            </div>
          </header>

          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}