/**
 * Vax or Fiction — Presentation Theme & Layout Rules (TypeScript)
 *
 * Source-derived presentation theme and format/layout system for the
 * Vax or Fiction React platform port.
 * Extracted directly from canonical VRC design system sources:
 * - src/design/theme.mjs — presentation theme, allowed pairs, contrast verification
 * - src/design/formats.mjs — formats, dimensions, minimum scales, compatibility
 * - src/design/layouts.mjs — layout families, raster anchors, question split thresholds
 * - src/design/scene-manifest.mjs — format geometry, copy tiers, scene manifest
 *
 * All values are exact disk-source values.
 */

// ─── 1. PRESENTATION THEME ──────────────────────────────────────────────────

export const presentationTheme = {
  canvasNavy: "#242d41",
  panelNavy: "#242a38",
  textPrimary: "#f5f5f4",
  textMuted: "#d6d3d1",
  textDim: "#a8a29e",
  hairline: "#2e2e33",
  requiredBoundary: "#a8a29e",
  emphasisRed: "#E05252",
  anticipationGold: "#E0A030",
  verdictTrue: "#3FB950",
  verdictFalse: "#f87171",
  timeWarning: "#e09f3e",
  accentCoral: "#E05252",
  accentCobalt: "#5B8DEF",
  accentGold: "#E0A030",
  accentPurple: "#A855F7",
  accentPink: "#E06090",
  accentTeal: "#20B2AA",
  accentOrange: "#F97316",
  accentGreen: "#3D9A6D",
} as const;

export type PresentationTheme = typeof presentationTheme;
export type ThemeRole = keyof PresentationTheme;

// ─── 2. WCAG CONTRAST VERIFICATION & ALLOWED PAIRS ──────────────────────────

/**
 * Standard sRGB channels extractor [red, green, blue] in 0..255.
 */
export function hexChannels(hex: string): [number, number, number] {
  const full = hex.length === 4
    ? `#${[...hex.slice(1)].map((c) => c + c).join("")}`
    : hex;
  const parts = full.slice(1).match(/.{2}/g);
  if (!parts || parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error(`invalid hex: ${hex}`);
  return [
    Number.parseInt(parts[0], 16),
    Number.parseInt(parts[1], 16),
    Number.parseInt(parts[2], 16),
  ];
}

/**
 * WCAG 2.1 relative luminance calculation.
 */
export function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexChannels(hex).map(linearChannel) as [number, number, number];
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/**
 * Exact WCAG contrast ratio between two hex colors.
 */
export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

export const WCAG_THRESHOLDS = {
  normalText: 4.5,
  largeTextOrNonText: 3.0,
  requiredBoundary: 3.0,
} as const;

export type ContrastPairKind = keyof typeof WCAG_THRESHOLDS;

export interface AllowedContrastPair {
  readonly id: string;
  readonly foreground: string;
  readonly background: string;
  readonly kind: ContrastPairKind;
  readonly minRatio: number;
  readonly actualRatio: number;
  readonly passes: boolean;
}

/**
 * Canonical WCAG-verified color contrast pairs from src/design/theme.mjs.
 * All 40 pairs verified pass WCAG AA standards.
 */
export const allowedPairs: readonly AllowedContrastPair[] = [
  // Normal Text Roles on Canvas & Panel
  {
    id: "text-primary-on-canvas",
    foreground: presentationTheme.textPrimary,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 12.61,
    passes: true,
  },
  {
    id: "text-primary-on-panel",
    foreground: presentationTheme.textPrimary,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 13.16,
    passes: true,
  },
  {
    id: "text-muted-on-canvas",
    foreground: presentationTheme.textMuted,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 9.23,
    passes: true,
  },
  {
    id: "text-muted-on-panel",
    foreground: presentationTheme.textMuted,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 9.63,
    passes: true,
  },
  {
    id: "text-dim-on-canvas",
    foreground: presentationTheme.textDim,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 5.45,
    passes: true,
  },
  {
    id: "text-dim-on-panel",
    foreground: presentationTheme.textDim,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 5.69,
    passes: true,
  },
  {
    id: "anticipation-gold-on-canvas",
    foreground: presentationTheme.anticipationGold,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 6.05,
    passes: true,
  },
  {
    id: "anticipation-gold-on-panel",
    foreground: presentationTheme.anticipationGold,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 6.31,
    passes: true,
  },
  {
    id: "verdict-true-on-canvas",
    foreground: presentationTheme.verdictTrue,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 5.41,
    passes: true,
  },
  {
    id: "verdict-true-on-panel",
    foreground: presentationTheme.verdictTrue,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 5.65,
    passes: true,
  },
  {
    id: "verdict-false-on-canvas",
    foreground: presentationTheme.verdictFalse,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 4.97,
    passes: true,
  },
  {
    id: "verdict-false-on-panel",
    foreground: presentationTheme.verdictFalse,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 5.19,
    passes: true,
  },
  {
    id: "time-warning-on-canvas",
    foreground: presentationTheme.timeWarning,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 6.02,
    passes: true,
  },
  {
    id: "time-warning-on-panel",
    foreground: presentationTheme.timeWarning,
    background: presentationTheme.panelNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 6.29,
    passes: true,
  },

  // Required Boundary Roles
  {
    id: "required-boundary-on-canvas",
    foreground: presentationTheme.requiredBoundary,
    background: presentationTheme.canvasNavy,
    kind: "requiredBoundary",
    minRatio: 3.0,
    actualRatio: 5.45,
    passes: true,
  },
  {
    id: "required-boundary-on-panel",
    foreground: presentationTheme.requiredBoundary,
    background: presentationTheme.panelNavy,
    kind: "requiredBoundary",
    minRatio: 3.0,
    actualRatio: 5.69,
    passes: true,
  },

  // Non-Text Accent Roles on Canvas & Panel
  {
    id: "emphasis-red-on-canvas",
    foreground: presentationTheme.emphasisRed,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.60,
    passes: true,
  },
  {
    id: "emphasis-red-on-panel",
    foreground: presentationTheme.emphasisRed,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.76,
    passes: true,
  },
  {
    id: "accent-coral-on-canvas",
    foreground: presentationTheme.accentCoral,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.60,
    passes: true,
  },
  {
    id: "accent-coral-on-panel",
    foreground: presentationTheme.accentCoral,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.76,
    passes: true,
  },
  {
    id: "accent-cobalt-on-canvas",
    foreground: presentationTheme.accentCobalt,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.26,
    passes: true,
  },
  {
    id: "accent-cobalt-on-panel",
    foreground: presentationTheme.accentCobalt,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.44,
    passes: true,
  },
  {
    id: "accent-gold-on-canvas",
    foreground: presentationTheme.accentGold,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 6.05,
    passes: true,
  },
  {
    id: "accent-gold-on-panel",
    foreground: presentationTheme.accentGold,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 6.31,
    passes: true,
  },
  {
    id: "accent-purple-on-canvas",
    foreground: presentationTheme.accentPurple,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.48,
    passes: true,
  },
  {
    id: "accent-purple-on-panel",
    foreground: presentationTheme.accentPurple,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.63,
    passes: true,
  },
  {
    id: "accent-pink-on-canvas",
    foreground: presentationTheme.accentPink,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.09,
    passes: true,
  },
  {
    id: "accent-pink-on-panel",
    foreground: presentationTheme.accentPink,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.27,
    passes: true,
  },
  {
    id: "accent-teal-on-canvas",
    foreground: presentationTheme.accentTeal,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 5.25,
    passes: true,
  },
  {
    id: "accent-teal-on-panel",
    foreground: presentationTheme.accentTeal,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 5.47,
    passes: true,
  },
  {
    id: "accent-orange-on-canvas",
    foreground: presentationTheme.accentOrange,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.91,
    passes: true,
  },
  {
    id: "accent-orange-on-panel",
    foreground: presentationTheme.accentOrange,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 5.12,
    passes: true,
  },
  {
    id: "accent-green-on-canvas",
    foreground: presentationTheme.accentGreen,
    background: presentationTheme.canvasNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 3.96,
    passes: true,
  },
  {
    id: "accent-green-on-panel",
    foreground: presentationTheme.accentGreen,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.13,
    passes: true,
  },

  // Semantic UI Component Pairs (M14)
  {
    id: "meter-cobalt-on-panel",
    foreground: presentationTheme.accentCobalt,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.44,
    passes: true,
  },
  {
    id: "badge-gold-on-panel",
    foreground: presentationTheme.anticipationGold,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 6.31,
    passes: true,
  },
  {
    id: "team-navy-on-panel",
    foreground: presentationTheme.accentCobalt,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 4.44,
    passes: true,
  },
  {
    id: "team-gold-on-panel",
    foreground: presentationTheme.anticipationGold,
    background: presentationTheme.panelNavy,
    kind: "largeTextOrNonText",
    minRatio: 3.0,
    actualRatio: 6.31,
    passes: true,
  },
  {
    id: "phone-verdict-true-on-canvas",
    foreground: presentationTheme.verdictTrue,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 5.41,
    passes: true,
  },
  {
    id: "phone-verdict-false-on-canvas",
    foreground: presentationTheme.verdictFalse,
    background: presentationTheme.canvasNavy,
    kind: "normalText",
    minRatio: 4.5,
    actualRatio: 4.97,
    passes: true,
  },
] as const;

// ─── 3. FORMAT DEFINITIONS & DIMENSIONS ─────────────────────────────────────

export type FormatId = "widescreen" | "square" | "portrait";

export interface FormatDefinition {
  readonly id: FormatId;
  readonly width: number;
  readonly height: number;
  readonly minScale: number;
  readonly statementFloor: number;
  readonly evidenceFloor: number;
  readonly sourceFloor: number;
  readonly spaceFactor: number;
  readonly typeFactor: number;
  readonly fullMeasure: boolean;
}

export const FORMAT_IDS: readonly FormatId[] = ["widescreen", "square", "portrait"] as const;

export const FORMAT_MINIMUM_SCALE = {
  widescreen: 0.8,
  square: 0.75,
  portrait: 0.9,
} as const;

export const formatDefinitions: Record<FormatId, FormatDefinition> = {
  widescreen: {
    id: "widescreen",
    width: 1600,
    height: 900,
    minScale: 0.8,
    statementFloor: 52,
    evidenceFloor: 24,
    sourceFloor: 18,
    spaceFactor: 1600 / 1920, // ~0.8333
    typeFactor: 1600 / 1920,
    fullMeasure: false,
  },
  square: {
    id: "square",
    width: 1200,
    height: 1200,
    minScale: 0.75,
    statementFloor: 42,
    evidenceFloor: 20,
    sourceFloor: 17,
    spaceFactor: 1200 / 1920, // 0.625
    typeFactor: 1200 / 1920,
    fullMeasure: true,
  },
  portrait: {
    id: "portrait",
    width: 430,
    height: 932,
    minScale: 0.9,
    statementFloor: 30,
    evidenceFloor: 17,
    sourceFloor: 16,
    spaceFactor: 430 / 1920, // ~0.224
    typeFactor: 0.34,
    fullMeasure: true,
  },
} as const;

/**
 * Computes fitted scale for a format inside viewport bounds.
 */
export function fittedScale(
  formatId: FormatId,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const format = formatDefinitions[formatId];
  if (!format) throw new Error(`unknown format: ${formatId}`);
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    throw new Error("viewport dimensions must be positive");
  }
  return Math.min(viewportWidth / format.width, viewportHeight / format.height);
}

export interface FormatCompatibilityResult {
  readonly compatible: boolean;
  readonly formatId: FormatId;
  readonly recommendedFormatId: FormatId;
  readonly scale: number;
}

/**
 * Evaluates whether viewport satisfies format minimum readability scale,
 * and recommends the best candidate format within window orientation.
 */
export function formatCompatibility(
  formatId: FormatId,
  viewportWidth: number,
  viewportHeight: number,
): FormatCompatibilityResult {
  const scale = fittedScale(formatId, viewportWidth, viewportHeight);
  const compatible = scale + Number.EPSILON >= FORMAT_MINIMUM_SCALE[formatId];
  const landscape = viewportWidth >= viewportHeight;
  const candidates = FORMAT_IDS.filter((candidateId) =>
    landscape ? candidateId !== "portrait" : candidateId !== "widescreen",
  );
  const ranked = candidates
    .map((candidateId) => ({
      candidateId,
      ratio:
        fittedScale(candidateId, viewportWidth, viewportHeight) /
        FORMAT_MINIMUM_SCALE[candidateId],
    }))
    .sort((left, right) => right.ratio - left.ratio);
  const recommendedFormatId = compatible
    ? formatId
    : (ranked[0]?.candidateId ?? formatId);

  return {
    compatible,
    formatId,
    recommendedFormatId,
    scale,
  };
}

// ─── 4. LAYOUT RULES & TEMPLATE GEOMETRY ─────────────────────────────────────

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FormatGeometry {
  readonly copyRect: NormalizedRect;
  readonly responseRect: NormalizedRect;
  readonly footerRect: NormalizedRect;
  readonly focalRect: NormalizedRect;
}

/**
 * Normalized canvas coordinate geometry for stage layouts (src/design/scene-manifest.mjs)
 */
export const formatGeometry: Record<FormatId, FormatGeometry> = {
  widescreen: {
    copyRect: { x: 0.04, y: 0.04, width: 0.45, height: 0.42 },
    responseRect: { x: 0.04, y: 0.50, width: 0.45, height: 0.36 },
    footerRect: { x: 0.04, y: 0.87, width: 0.92, height: 0.107 },
    focalRect: { x: 0.50, y: 0.03, width: 0.48, height: 0.84 },
  },
  square: {
    copyRect: { x: 0.05, y: 0.05, width: 0.44, height: 0.41 },
    responseRect: { x: 0.05, y: 0.50, width: 0.44, height: 0.36 },
    footerRect: { x: 0.04, y: 0.90, width: 0.92, height: 0.080 },
    focalRect: { x: 0.50, y: 0.03, width: 0.47, height: 0.84 },
  },
  portrait: {
    copyRect: { x: 0.03, y: 0.283, width: 0.94, height: 0.300 },
    responseRect: { x: 0.03, y: 0.610, width: 0.94, height: 0.250 },
    footerRect: { x: 0.0372, y: 0.910, width: 0.9256, height: 0.080 },
    focalRect: { x: 0.04, y: 0.000, width: 0.92, height: 0.2575 },
  },
} as const;

/**
 * Layout template families from src/design/layouts.mjs
 */
export const questionLayoutFamilies = [
  "editorial-split",
  "numeric-poster",
  "three-site-map",
  "comparison",
  "timeline",
  "offset-split",
] as const;

export type QuestionLayoutFamily = typeof questionLayoutFamilies[number];
export const fullFrameFamily = "full-frame" as const;

/**
 * Mapping from layout family to raster composition anchor
 */
export const rasterAnchors = {
  "editorial-split": "editorial-field",
  "numeric-poster": "organic-crop",
  "three-site-map": "site-ribbon",
  comparison: "comparison-field",
  timeline: "history-band",
  "offset-split": "offset-field",
  "full-frame": "full-frame",
} as const;

export type RasterAnchor = typeof rasterAnchors[keyof typeof rasterAnchors];

/**
 * Copy length thresholds and split percentages
 */
export const questionSplitRules = {
  shortCopyThreshold: 65,
  longCopyThreshold: 80,
  defaultSplit: { copy: 56, image: 44, variant: "default" as const },
  longCopySplit: { copy: 60, image: 40, variant: "long-copy" as const },
} as const;

export function questionSplitFor(statement: string | null | undefined): {
  readonly copy: number;
  readonly image: number;
  readonly variant: "default" | "long-copy";
} {
  const isLong = String(statement ?? "").length > questionSplitRules.longCopyThreshold;
  return isLong ? questionSplitRules.longCopySplit : questionSplitRules.defaultSplit;
}

export function layoutFor(family: string | null | undefined): QuestionLayoutFamily {
  if (!family || !questionLayoutFamilies.includes(family as QuestionLayoutFamily)) {
    throw new Error(`question layout is undeclared: ${family ?? "missing"}`);
  }
  return family as QuestionLayoutFamily;
}

// ─── 5. SCENE MANIFEST & PLATES ─────────────────────────────────────────────

export const WIDESCREEN_ONLY_IMAGE_IDS = [
  "plate-curated-q13",
  "plate-curated-q19",
  "plate-curated-q20",
  "plate-curated-q21",
  "plate-curated-q22",
  "plate-curated-q24",
  "plate-curated-q25",
  "plate-curated-q26",
  "plate-curated-q27",
  "plate-curated-q28",
  "plate-curated-q29",
  "plate-curated-q30",
  "plate-curated-q33",
] as const;

export const SCENE_IMAGE_IDS = [
  ...Array.from({ length: 20 }, (_, index) => `plate-q${String(index + 1).padStart(2, "0")}`),
  "plate-care-team",
  ...WIDESCREEN_ONLY_IMAGE_IDS,
] as const;

export type SceneImageId = typeof SCENE_IMAGE_IDS[number];

/**
 * Soft IMZ and classic stock plates were rejected as live stage art.
 * Catalog stays empty so ShowFrame cannot resolve plate atmosphere.
 */
export const ATMOSPHERIC_PLATE_IDS = [] as const;

export type AtmosphericPlateId = (typeof ATMOSPHERIC_PLATE_IDS)[number];

/** Stage beats for lights / scrim tone. No plate is mapped to a beat. */
export const ATMOSPHERIC_BEATS = [
  "setup",
  "lobby",
  "title",
  "instructions",
  "deliberating",
  "reveal",
  "leaderboard",
  "closing",
] as const;

export type AtmosphericBeat = (typeof ATMOSPHERIC_BEATS)[number];

/** @deprecated Soft IMZ stage mapping — always empty; lights/scrim only. */
export const ATMOSPHERIC_PLATE_BY_BEAT: Readonly<Record<AtmosphericBeat, null>> = {
  setup: null,
  lobby: null,
  title: null,
  instructions: null,
  deliberating: null,
  reveal: null,
  leaderboard: null,
  closing: null,
};

export const ATMOSPHERIC_PLATE_FOCUS: Readonly<Record<string, string>> = {};

export function isAtmosphericPlateId(imageId: string): boolean {
  return (ATMOSPHERIC_PLATE_IDS as readonly string[]).includes(imageId);
}

/**
 * Live show frames paint lights + scrim only. Soft IMZ, classic, curated, and
 * care-team ids are never stage atmosphere — always null.
 */
export function stagePlateId(
  _imageRequirementId?: string | null,
  _beat?: AtmosphericBeat,
  _cycleIndex = 0,
): null {
  return null;
}

export type CopyTier = "short" | "standard" | "long" | "extra-long";

export const copyTiers: Record<SceneImageId, CopyTier> = {
  "plate-q01": "standard",
  "plate-q02": "standard",
  "plate-q03": "long",
  "plate-q04": "standard",
  "plate-q05": "standard",
  "plate-q06": "standard",
  "plate-q07": "standard",
  "plate-q08": "standard",
  "plate-q09": "standard",
  "plate-q10": "long",
  "plate-q11": "long",
  "plate-q12": "standard",
  "plate-q13": "long",
  "plate-q14": "short",
  "plate-q15": "extra-long",
  "plate-q16": "standard",
  "plate-q17": "long",
  "plate-q18": "long",
  "plate-q19": "long",
  "plate-q20": "extra-long",
  "plate-care-team": "long",
  "plate-curated-q13": "standard",
  "plate-curated-q19": "long",
  "plate-curated-q20": "long",
  "plate-curated-q21": "standard",
  "plate-curated-q22": "standard",
  "plate-curated-q24": "long",
  "plate-curated-q25": "standard",
  "plate-curated-q26": "long",
  "plate-curated-q27": "long",
  "plate-curated-q28": "long",
  "plate-curated-q29": "standard",
  "plate-curated-q30": "standard",
  "plate-curated-q33": "long",
} as const;

export interface ScenePlacement {
  readonly sceneId: string;
  readonly formatId: FormatId;
  readonly copyTier: CopyTier;
  readonly tone: "navy";
  readonly copyRect: NormalizedRect;
  readonly responseRect: NormalizedRect;
  readonly footerRect: NormalizedRect;
  readonly focalRect: NormalizedRect;
}

export function scenePlacement(sceneId: SceneImageId, formatId: FormatId): ScenePlacement {
  const geometry = formatGeometry[formatId];
  if (!geometry) throw new Error(`unknown format: ${formatId}`);
  const copyTier = copyTiers[sceneId];
  if (!copyTier) throw new Error(`unknown scene: ${sceneId}`);

  return {
    sceneId,
    formatId,
    copyTier,
    tone: "navy",
    copyRect: geometry.copyRect,
    responseRect: geometry.responseRect,
    footerRect: geometry.footerRect,
    focalRect: geometry.focalRect,
  };
}

export function formatImageId(imageId: string, formatId: FormatId): string {
  if (!SCENE_IMAGE_IDS.includes(imageId as SceneImageId)) {
    throw new Error(`unknown scene image: ${imageId}`);
  }
  if (!FORMAT_IDS.includes(formatId)) {
    throw new Error(`unknown format: ${formatId}`);
  }
  return formatId === "widescreen" ? imageId : `${imageId}-${formatId}`;
}
