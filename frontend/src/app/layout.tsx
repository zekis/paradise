import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paradise",
  description: "Spatial canvas for AI agent fleet management",
  icons: {
    icon: "/favicon.svg",
  },
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
