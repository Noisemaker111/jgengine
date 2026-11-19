import type { BuildingKit } from "@jgengine/core/buildings/buildingKit";

/**
 * Kits a game has bound, keyed by `BuildingKit.id`.
 *
 * Scene documents name a kit rather than embedding it, so an authored city stays portable and free
 * of model paths while the game keeps ownership of its art. Registration is the game's job — the
 * engine ships no kits.
 */
const kits = new Map<string, BuildingKit>();

export function registerBuildingKit(kit: BuildingKit): void {
  kits.set(kit.id, kit);
}

export function getBuildingKit(id: string | undefined): BuildingKit | undefined {
  if (id === undefined || id === "") return undefined;
  return kits.get(id);
}

export function listBuildingKits(): string[] {
  return [...kits.keys()].sort();
}

export function clearBuildingKits(): void {
  kits.clear();
}
