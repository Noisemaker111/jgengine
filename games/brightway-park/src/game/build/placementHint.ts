import { defineStore } from "@jgengine/core/store/defineStore";

import type { PlacementCheck } from "./placement";

/**
 * Why the hovered blueprint spot cannot be built, or null when it can (or nothing is hovered).
 * The world overlay writes it on hover so the build bar can explain a red footprint before the
 * player clicks, instead of only after a refused click. Per-context store slot, not module state.
 */
export const placementHintStore = defineStore<string | null>("brightway.placementHint", null);

export function hoverRefusal(check: PlacementCheck): string | null {
  return check.ok ? null : check.reason;
}
