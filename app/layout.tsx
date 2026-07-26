import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Room — Faraday Intelligence",
  description:
    "Faraday's live Signal feed — every Signal fired across the buildout, filterable by Theater, Sector and Thread.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
