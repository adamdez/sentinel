"use client";

import { usePsalm20, PSALM20_FULL_ESV } from "./use-psalm20";

/**
 * Renders the full text of Psalm 20 (ESV) as a faint gold watermark behind
 * all page content. The text repeats vertically to fill any viewport height.
 * Pointer-events are disabled so it never interferes with the UI.
 */
export function ScriptureWatermark() {
  const active = usePsalm20();
  if (!active) return null;

  const lines = PSALM20_FULL_ESV.split("\n");

  return (
    <div
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      {/* Top fade — text emerges from darkness */}
      <div
        className="absolute top-0 left-0 right-0 h-32 z-10"
        style={{ background: "linear-gradient(to bottom, var(--psalm20-navy) 0%, transparent 100%)" }}
      />
      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 z-10"
        style={{ background: "linear-gradient(to top, var(--psalm20-navy) 0%, transparent 100%)" }}
      />

      <div className="absolute inset-0 flex justify-center px-12 py-24">
        <div className="max-w-2xl w-full space-y-[2px]">
          {/* Render the psalm 3 times to fill tall viewports */}
          {[0, 1, 2].map((pass) => (
            <div key={pass} className={pass > 0 ? "mt-16" : undefined}>
              {/* Psalm number header */}
              <p
                className="text-center mb-6 tracking-[0.35em] uppercase font-semibold"
                style={{
                  color: "var(--psalm20-gold)",
                  opacity: 0.12,
                  fontSize: "11px",
                }}
              >
                Psalm 20
              </p>

              {lines.map((line, i) => (
                <p
                  key={`${pass}-${i}`}
                  className="text-center leading-[2.2]"
                  style={{
                    color: "var(--psalm20-gold)",
                    opacity: line.trim() === "" ? 0 : 0.09,
                    fontSize: "14px",
                    letterSpacing: "0.06em",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontWeight: 400,
                    fontStyle: "italic",
                  }}
                >
                  {line || "\u00A0"}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
