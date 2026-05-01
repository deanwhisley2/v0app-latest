// ============================================================
// NEXUS PRO — Design System Theme
// Complete color palette, typography, spacing, and utility tokens
// Based on the NEXUS PRO Master Context Brief design system
// ============================================================

export const NEXUS_COLORS = {
  // Backgrounds
  background: '#0A0B0E',
  surface: '#111318',
  border: '#1E2028',

  // Accents
  primary: '#00E5FF',
  secondary: '#39FF14',
  danger: '#FF3A3A',
  warning: '#FFB800',

  // Text
  textPrimary: '#F0F2F5',
  textSecondary: '#8B92A5',

  // Semantic
  profit: '#39FF14',
  loss: '#FF3A3A',
  pending: '#FFB800',
  info: '#00E5FF',

  // Status
  active: '#39FF14',
  inactive: '#8B92A5',
  blocked: '#FF3A3A',
  learning: '#00E5FF',
  safe: '#39FF14',
  dangerStatus: '#FF3A3A',
  warningStatus: '#FFB800',

  // Chart colors
  chartCyan: '#00E5FF',
  chartGreen: '#39FF14',
  chartRed: '#FF3A3A',
  chartAmber: '#FFB800',
  chartPurple: '#A855F7',
} as const;

export const NEXUS_FONTS = {
  display: "'Space Mono', monospace",
  body: "'Inter', sans-serif",
} as const;

export const NEXUS_SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
} as const;

export const NEXUS_RADIUS = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const NEXUS_SHADOWS = {
  card: '0 2px 8px rgba(0, 0, 0, 0.3)',
  glow: '0 0 12px rgba(0, 229, 255, 0.15)',
  glowGreen: '0 0 12px rgba(57, 255, 20, 0.15)',
  glowRed: '0 0 12px rgba(255, 58, 58, 0.15)',
  elevated: '0 8px 32px rgba(0, 0, 0, 0.4)',
} as const;

export const NEXUS_ANIMATIONS = {
  pulse: 'pulse-glow 2s ease-in-out infinite',
  slideIn: 'slide-in 0.3s ease forwards',
  fadeIn: 'fade-in 0.2s ease forwards',
  ticker: 'ticker 30s linear infinite',
} as const;

// Type helpers
export type NexusColorKey = keyof typeof NEXUS_COLORS;
export type NexusFontKey = keyof typeof NEXUS_FONTS;
export type NexusSpacingKey = keyof typeof NEXUS_SPACING;
export type NexusRadiusKey = keyof typeof NEXUS_RADIUS;

// Utility: get CSS variable value from oklch color
export function oklchColor(lightness: number, chroma: number, hue: number): string {
  return `oklch(${lightness} ${chroma} ${hue})`;
}

// Pre-computed oklch values matching the design system
export const OKLCH = {
  background: 'oklch(0.07 0.01 250)',
  surface: 'oklch(0.10 0.015 250)',
  border: 'oklch(0.20 0.02 250)',
  primary: 'oklch(0.65 0.20 195)',
  secondary: 'oklch(0.70 0.18 150)',
  danger: 'oklch(0.60 0.22 25)',
  warning: 'oklch(0.75 0.18 85)',
  textPrimary: 'oklch(0.95 0.01 250)',
  textSecondary: 'oklch(0.60 0.03 250)',
} as const;
