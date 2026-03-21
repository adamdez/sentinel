import type { Metadata } from "next";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Providers } from "@/providers/providers";

/** Runs before paint; mirrors migrateLegacyThemeId + applyThemeToDocument (theme-provider). */
const themeBootScript = `(function(){try{var k="sentinel-theme";var t=localStorage.getItem(k);var m="dark";if(t==="light")m="light";else if(t==="dark")m="dark";else m="dark";var el=document.documentElement;el.setAttribute("data-sentinel-theme",m);el.classList.toggle("dark",m==="dark");}catch(e){var el=document.documentElement;el.setAttribute("data-sentinel-theme","dark");el.classList.add("dark");}})();`;

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
    <html lang="en" className="dark" suppressHydrationWarning data-sentinel-theme="dark">
      <body className="min-h-screen bg-background antialiased relative" suppressHydrationWarning>
        <Script id="sentinel-theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
