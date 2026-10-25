/**
 * All builder I/O in one place: browser localStorage plus the dev-server
 * endpoints (library, recent generated assets, source library rewrite, AI
 * generation). The store stays a pure state machine over these calls.
 */
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import { sanitizeGeneratedAsset } from "@llmville/game/builder/generatedAsset";

import type { BuilderAssetLibraryEntry } from "@/dev/builder/builderLibrary";

const GENERATED_ASSET_ENDPOINT = "/__llmville-builder/generate";
const RECENT_ASSETS_ENDPOINT = "/__llmville-builder/recent";
const REPO_LIBRARY_ENDPOINT = "/__llmville-builder/library";
const SOURCE_LIBRARY_ENDPOINT = "/__llmville-builder/source-library";
const LOCAL_LIBRARY_STORAGE_KEY = "llmville.dev.builder.library";

export const MAX_RECENT_GENERATED_ASSETS = 24;

export type BuilderRecentAssetStatus = "pending" | "ready" | "error";

export interface BuilderRecentAsset {
  id: string;
  label: string;
  prompt: string;
  createdAt: number;
  decor?: DecorItemSpec;
  status?: BuilderRecentAssetStatus;
  error?: string;
}

export function recentAssetStatus(asset: BuilderRecentAsset): BuilderRecentAssetStatus {
  if (asset.status) return asset.status;
  return asset.decor ? "ready" : "error";
}

export function loadLocalLibraryEntries(): BuilderAssetLibraryEntry[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LOCAL_LIBRARY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BuilderAssetLibraryEntry[];
  } catch {
    window.localStorage.removeItem(LOCAL_LIBRARY_STORAGE_KEY);
    return null;
  }
}

/** Persist non-seed entries to localStorage and mirror them to the repo file. */
export function persistLocalLibraryEntries(entries: readonly BuilderAssetLibraryEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
  void fetch(REPO_LIBRARY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entries, null, 2),
  }).catch(() => undefined);
}

export async function fetchRepoLibraryEntries(): Promise<BuilderAssetLibraryEntry[]> {
  try {
    const response = await fetch(REPO_LIBRARY_ENDPOINT);
    if (!response.ok) return [];
    return await response.json() as BuilderAssetLibraryEntry[];
  } catch {
    return [];
  }
}

/** Rewrite the checked-in seed library (`assetLibrary.ts`). Throws on failure. */
export async function saveSourceLibraryEntries(entries: readonly BuilderAssetLibraryEntry[]): Promise<void> {
  const response = await fetch(SOURCE_LIBRARY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!response.ok) {
    let message = `Source save failed with HTTP ${response.status}.`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // keep HTTP status message
    }
    throw new Error(message);
  }
}

export async function fetchRecentAssets(): Promise<BuilderRecentAsset[]> {
  try {
    const response = await fetch(RECENT_ASSETS_ENDPOINT);
    if (!response.ok) return [];
    const entries = await response.json() as BuilderRecentAsset[];
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry) => entry.decor !== undefined)
      .map((entry) => ({ ...entry, status: recentAssetStatus(entry) }))
      .slice(0, MAX_RECENT_GENERATED_ASSETS);
  } catch {
    return [];
  }
}

export function persistRecentAssets(entries: readonly BuilderRecentAsset[]): void {
  if (typeof window === "undefined") return;
  const payload = entries
    .filter((entry) => entry.decor !== undefined && recentAssetStatus(entry) === "ready")
    .slice(0, MAX_RECENT_GENERATED_ASSETS);
  void fetch(RECENT_ASSETS_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload, null, 2),
  }).catch(() => undefined);
}

/** Ask the local agent endpoint to compose a prompt into primitives. Throws on failure. */
export async function requestGeneratedAsset(prompt: string): Promise<DecorItemSpec> {
  const response = await fetch(GENERATED_ASSET_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const payload = await response.json().catch(() => null) as { item?: unknown; error?: string } | null;
  if (!response.ok || !payload || payload.error !== undefined || payload.item === undefined) {
    throw new Error(payload?.error ?? `Generation failed (HTTP ${response.status}).`);
  }
  const parsed = sanitizeGeneratedAsset(payload.item);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.item;
}
