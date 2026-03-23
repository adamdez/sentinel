"use client";

import { cn } from "@/lib/utils";

interface Psalm20IconProps {
  className?: string;
  /** Gold accent color — defaults to current gold token */
  color?: string;
}

/** Upward banner / standard — the primary Psalm 20 motif */
export function BannerIcon({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <path
        d="M12 2v20M12 2l-6 4v6l6-3M12 2l6 4v6l-6-3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Shield / protection motif */
export function ShieldIcon({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <path
        d="M12 3L4 7v5c0 5.25 3.4 10.15 8 11.25 4.6-1.1 8-6 8-11.25V7l-8-4z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 8v5M12 16h.01"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Seal / signet motif — covenant trust */
export function SealIcon({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5.5" stroke={color} strokeWidth="1" opacity="0.6" />
      <path
        d="M12 7l1.3 2.6L16 10.2l-1.9 2 .4 2.8L12 13.8 9.5 15l.4-2.8-1.9-2 2.7-.6L12 7z"
        fill={color}
        opacity="0.4"
      />
    </svg>
  );
}

/** Crown / sovereignty motif */
export function CrownIcon({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <path
        d="M4 17l2-10 4 4 2-6 2 6 4-4 2 10H4z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M4 17h16v2H4v-2z" fill={color} opacity="0.15" />
    </svg>
  );
}

/** Upward rays / light from the sanctuary */
export function SanctuaryRays({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <path d="M12 2v6M4.93 4.93l4.24 4.24M19.07 4.93l-4.24 4.24" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 12h4M18 12h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <circle cx="12" cy="14" r="4" stroke={color} strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

/** Victory wreath — restrained olive-branch styling */
export function WreathIcon({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <path
        d="M12 22c-4-2-7-5.5-7-10 0-3 1.5-5.5 3.5-7M12 22c4-2 7-5.5 7-10 0-3-1.5-5.5-3.5-7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 2l-1.5 3L12 7l1.5-2L12 2z" fill={color} opacity="0.3" />
    </svg>
  );
}

/** Fortress gate — fortified geometry */
export function FortressIcon({ className, color = "currentColor" }: Psalm20IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("h-6 w-6", className)} aria-hidden>
      <path d="M3 21V7l3-4h12l3 4v14" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 21v-6a3 3 0 016 0v6" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 7h18" stroke={color} strokeWidth="1.5" />
      <rect x="6" y="10" width="3" height="3" rx="0.5" stroke={color} strokeWidth="1" opacity="0.5" />
      <rect x="15" y="10" width="3" height="3" rx="0.5" stroke={color} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/** Large decorative banner — for login and hero areas */
export function BannerLarge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 80" fill="none" className={cn("w-full", className)} aria-hidden>
      <defs>
        <linearGradient id="bannerGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--psalm20-gold)" stopOpacity="0.6" />
          <stop offset="50%" stopColor="var(--psalm20-gold)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--psalm20-gold)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Horizontal banner ribbon */}
      <path d="M10 35 L45 25 L100 30 L155 25 L190 35 L155 45 L100 40 L45 45 Z" stroke="url(#bannerGoldGrad)" strokeWidth="1" fill="none" />
      {/* Center seal */}
      <circle cx="100" cy="35" r="14" stroke="var(--psalm20-gold)" strokeWidth="0.8" opacity="0.35" />
      <circle cx="100" cy="35" r="9" stroke="var(--psalm20-gold)" strokeWidth="0.5" opacity="0.2" />
      {/* Vertical standard lines */}
      <line x1="100" y1="8" x2="100" y2="62" stroke="var(--psalm20-gold)" strokeWidth="0.5" opacity="0.15" />
      {/* Corner rays */}
      <line x1="70" y1="12" x2="80" y2="22" stroke="var(--psalm20-gold)" strokeWidth="0.4" opacity="0.15" />
      <line x1="130" y1="12" x2="120" y2="22" stroke="var(--psalm20-gold)" strokeWidth="0.4" opacity="0.15" />
    </svg>
  );
}

/** Gold horizontal divider with subtle center-seal motif */
export function GoldDivider({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 8" fill="none" className={cn("w-full h-2", className)} aria-hidden preserveAspectRatio="none">
      <line x1="0" y1="4" x2="180" y2="4" stroke="var(--psalm20-gold)" strokeWidth="0.5" opacity="0.2" />
      <circle cx="200" cy="4" r="3" stroke="var(--psalm20-gold)" strokeWidth="0.5" opacity="0.3" />
      <circle cx="200" cy="4" r="1" fill="var(--psalm20-gold)" opacity="0.25" />
      <line x1="220" y1="4" x2="400" y2="4" stroke="var(--psalm20-gold)" strokeWidth="0.5" opacity="0.2" />
    </svg>
  );
}
