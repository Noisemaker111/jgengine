/**
 * Viewport/input-modality profile for adaptive HUDs: coarse pointer means a
 * touchscreen is the primary input (mount touch controls, enlarge tap
 * targets), compact means phone-width layout (collapse side panels), portrait
 * distinguishes the two phone orientations. Values track live media-query
 * changes and are safe to read during SSR (everything false).
 */

import { useSyncExternalStore } from "react";

export interface DisplayProfile {
  coarsePointer: boolean;
  compact: boolean;
  portrait: boolean;
}

const QUERIES = {
  coarsePointer: "(pointer: coarse)",
  compact: "(max-width: 820px)",
  portrait: "(orientation: portrait)",
} as const;

const SERVER_PROFILE: DisplayProfile = { coarsePointer: false, compact: false, portrait: false };

let cached: DisplayProfile = SERVER_PROFILE;

function readProfile(): DisplayProfile {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return SERVER_PROFILE;
  const next: DisplayProfile = {
    coarsePointer: window.matchMedia(QUERIES.coarsePointer).matches,
    compact: window.matchMedia(QUERIES.compact).matches,
    portrait: window.matchMedia(QUERIES.portrait).matches,
  };
  if (
    next.coarsePointer !== cached.coarsePointer ||
    next.compact !== cached.compact ||
    next.portrait !== cached.portrait
  ) {
    cached = next;
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const lists = Object.values(QUERIES).map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

export function useDisplayProfile(): DisplayProfile {
  return useSyncExternalStore(subscribe, readProfile, () => SERVER_PROFILE);
}
