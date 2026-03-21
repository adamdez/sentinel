import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Dominion Home Deals — Spokane Cash Home Buyers",
    template: "%s | Dominion Home Deals",
  },
  description:
    "We buy houses for cash in Spokane and Kootenai County. No repairs, no agents, no fees. Get a fair offer and close on your timeline.",
  metadataBase: new URL("https://dominionhomedeals.com"),
  openGraph: {
    siteName: "Dominion Home Deals",
    locale: "en_US",
    type: "website",
  },
};

/**
 * Public layout — seller-facing pages.
 *
 * Intentionally minimal:
 *   - Light theme (sellers are not on a dark CRM)
 *   - Clean header with company name + phone
 *   - No sidebar, no internal nav, no auth context
 *   - Shared footer with service area and contact
 *
 * BOUNDARY: zero imports from (sentinel), dialer, or CRM modules.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-foreground antialiased">
        {/* ── Header ── */}
        <header className="border-b border-border bg-white sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
            <a href="/sell" className="flex items-center gap-2 text-foreground hover:text-foreground transition-colors">
              <span className="text-lg font-semibold tracking-tight">Dominion Home Deals</span>
            </a>
            <a
              href="tel:+15098001234"
              className="text-sm font-medium text-foreground hover:text-foreground transition-colors"
            >
              (509) 800-1234
            </a>
          </div>
        </header>

        {/* ── Content ── */}
        <main>{children}</main>

        {/* ── Footer ── */}
        <footer className="mt-20 border-t border-border bg-muted">
          <div className="max-w-3xl mx-auto px-5 py-10 space-y-4">
            <p className="text-sm font-medium text-foreground">Dominion Home Deals</p>
            <p className="text-sm text-foreground leading-relaxed">
              We buy houses for cash in Spokane County, WA and Kootenai County, ID.
              We are not a real estate agency and we are not listing your home.
              All offers are as-is with no obligation to accept.
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <a href="/sell"           className="text-foreground hover:text-foreground transition-colors">How it works</a>
              <a href="/sell/inherited" className="text-foreground hover:text-foreground transition-colors">Inherited property</a>
              <a href="/sell/about"     className="text-foreground hover:text-foreground transition-colors">About us</a>
              <a href="tel:+15098001234" className="text-foreground hover:text-foreground transition-colors">(509) 800-1234</a>
            </div>
            <p className="text-xs text-foreground">
              © {new Date().getFullYear()} Dominion Home Deals. Spokane, WA.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
