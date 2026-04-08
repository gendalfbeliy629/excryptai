import "./globals.css";
import type { Metadata } from "next";
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
          <main className="main main-compact">{children}</main>
        </div>
      </body>
    </html>
  );
}
