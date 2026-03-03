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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("paradise-theme");if(m==="light")document.documentElement.setAttribute("data-theme","light");else if(m==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches)document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
