import type { BuildingKit } from "@jgengine/core/world/buildingKit";

/**
 * Kits a game has bound, keyed by `BuildingKit.id`.
 *
 * Scene documents name a kit rather than embedding it, so an authored city stays portable and free
 * of model paths while the game keeps ownership of its art. Registration is the game's job — the
 * engine ships no kits.
 */
const kits = new Map<string, BuildingKit>();

/** Registers a kit under its own `id`, replacing any kit already registered under that name. */
export function registerBuildingKit(kit: BuildingKit): void {
  kits.set(kit.id, kit);
}

/** The kit registered under `id`, or `undefined` for an unset or unknown name (renders blocks). */
export function getBuildingKit(id: string | undefined): BuildingKit | undefined {
  if (id === undefined || id === "") return undefined;
  return kits.get(id);
}

/** Every registered kit id — the editor's kit picker and diagnostics read this. */
export function listBuildingKits(): string[] {
  return [...kits.keys()].sort();
}

/** Drops every registration. For tests and hot-reload teardown. */
export function clearBuildingKits(): void {
  kits.clear();
}
