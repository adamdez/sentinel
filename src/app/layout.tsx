import type { Metadata } from "next";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./themes/ghost-mode.css";
import { Providers } from "@/providers/providers";

const themeBootScript = `(function(){try{var k="sentinel-theme";var t=localStorage.getItem(k);if(t==="ghost-mode"||t==="default")document.documentElement.setAttribute("data-sentinel-theme",t);else document.documentElement.setAttribute("data-sentinel-theme","default");}catch(e){document.documentElement.setAttribute("data-sentinel-theme","default");}})();`;

export const metadata: Metadata = {
  title: "Sentinel — Unified ERP",
  description: "Real estate wholesaling command system",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning data-sentinel-theme="default">
      <body className="min-h-screen bg-background antialiased relative" suppressHydrationWarning>
        <Script id="sentinel-theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
