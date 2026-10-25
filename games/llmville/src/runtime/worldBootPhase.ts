export interface WorldBootPhaseInput {
  gameStateLoaded: boolean;
  canViewGame: boolean;
  gameFound: boolean;
  presenceLoaded: boolean;
  queryBundleReady: boolean;
  shopCatalogLoaded: boolean;
}

/** Ordered boot gates — one source of truth for both the step label and the
 * progress fraction, so the bar and the caption can never disagree. */
const BOOT_STEPS: readonly { ready: (input: WorldBootPhaseInput) => boolean; label: string }[] = [
  { ready: (i) => i.gameStateLoaded, label: "Connecting to your lab…" },
  { ready: (i) => i.canViewGame, label: "Checking access…" },
  { ready: (i) => i.gameFound, label: "Looking up world…" },
  { ready: (i) => i.presenceLoaded, label: "Finding your character…" },
  { ready: (i) => i.queryBundleReady, label: "Loading world data…" },
  { ready: (i) => i.shopCatalogLoaded, label: "Loading store catalog…" },
];

/** Human-readable boot step while Convex queries and maps resolve. */
export function deriveWorldBootLabel(input: WorldBootPhaseInput): string {
  const next = BOOT_STEPS.find((step) => !step.ready(input));
  return next ? next.label : "Entering world…";
}

/** Fraction (0..1) of boot gates passed, counted up to the first incomplete one
 * so the bar only ever moves forward. */
export function deriveWorldBootProgress(input: WorldBootPhaseInput): number {
  const firstIncomplete = BOOT_STEPS.findIndex((step) => !step.ready(input));
  const completed = firstIncomplete === -1 ? BOOT_STEPS.length : firstIncomplete;
  return completed / BOOT_STEPS.length;
}
