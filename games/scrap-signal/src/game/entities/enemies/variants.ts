import type { Surface } from "../../handroll";
import type { MACHINE } from "../../palette";

/**
 * A zone's local breed of a common enemy: Borderlands' badass and elemental cousins. It borrows its
 * base's rig, attack and drops, and changes what a player reads off it: its body (the element chart),
 * a shield, how tough and quick it is, and the colour of its plate.
 */
export interface EnemyVariant {
  id: string;
  name: string;
  base: string;
  /** The zone it lives in: a breed joins that zone's camps (`squads`); a named one is put there by its quest. */
  zone: string;
  /** A named target: one of a kind, placed by the quest that hunts it rather than by a camp. */
  named?: true;
  surface?: Surface;
  elite?: boolean;
  /** Shield points before level scaling; a shield answers to shock first. */
  shield?: number;
  health: number;
  damage: number;
  speed?: number;
  scale?: number;
  xp: number;
  /** Plate hue, so the breed reads apart from its base at range; a machine hue, never a terrain one. */
  plate: keyof typeof MACHINE;
}

export const ENEMY_VARIANTS: readonly EnemyVariant[] = [
  // Breakwater Shelf, level 4: Rusk's people and what lives on the shore.
  { id: "scorch_husk", name: "Scorched Husk", base: "husk", zone: "breakwater_shelf", health: 1.4, damage: 1.2, xp: 1.4, plate: "rust" },
  { id: "shelf_raider", name: "Shelf Raider", base: "marauder", zone: "breakwater_shelf", shield: 40, health: 1.1, damage: 1.15, xp: 1.5, plate: "iron" },
  { id: "tide_bruiser", name: "Tide Bruiser", base: "bruiser", zone: "breakwater_shelf", surface: "armor", health: 1.3, damage: 1.1, xp: 1.5, plate: "joint" },
  // Arid Badlands, level 8: the hub's hinterland.
  { id: "dust_ripper", name: "Dust Ripper", base: "ripper", zone: "arid_badlands", surface: "flesh", health: 0.9, damage: 1, speed: 1.25, xp: 1.1, plate: "rust" },
  { id: "ripper_matriarch", name: "Ripper Matriarch", base: "elite_ripper", zone: "arid_badlands", elite: true, health: 1.4, damage: 1.2, scale: 1.15, xp: 1.5, plate: "joint" },
  { id: "sand_hauler", name: "Sand Hauler", base: "marauder", zone: "arid_badlands", shield: 120, health: 1.1, damage: 1.1, xp: 1.4, plate: "steel" },
  // Split-Ridge Pass, level 12: crawler country.
  { id: "ridge_raider", name: "Ridge Raider", base: "marauder", zone: "split_ridge", surface: "armor", health: 1.6, damage: 1.2, xp: 1.6, plate: "joint" },
  { id: "crawler_spitter", name: "Crawler Spitter", base: "crawler", zone: "split_ridge", surface: "flesh", health: 0.9, damage: 1.25, speed: 1.3, xp: 1.2, plate: "hazard" },
  { id: "brood_crawler", name: "Brood Crawler", base: "crawler_soldier", zone: "split_ridge", elite: true, health: 2.2, damage: 1.3, scale: 1.3, xp: 2.6, plate: "joint" },
  // Glasswind Flats, level 17: shields everywhere, so shock pays.
  { id: "shard_crawler", name: "Shard Crawler", base: "crawler", zone: "glasswind_flats", shield: 60, health: 1, damage: 1.1, xp: 1.4, plate: "rimCool" },
  { id: "glass_husk", name: "Glass Husk", base: "husk", zone: "glasswind_flats", shield: 90, health: 1.2, damage: 1.2, xp: 1.6, plate: "rimCool" },
  { id: "glasswind_hauler", name: "Glasswind Hauler", base: "nomad", zone: "glasswind_flats", surface: "armor", health: 1.3, damage: 1.2, xp: 1.5, plate: "steel" },
  // Cores Blight, level 24: the foundry's last guard.
  { id: "slag_loader", name: "Slag Loader", base: "loader", zone: "cores_blight", surface: "flesh", health: 1.3, damage: 1.15, xp: 1.4, plate: "rust" },
  { id: "core_crawler", name: "Core Crawler", base: "crawler_soldier", zone: "cores_blight", shield: 100, health: 1.2, damage: 1.2, xp: 1.5, plate: "opticElite" },
  { id: "blight_husk", name: "Blight Husk", base: "elite_husk", zone: "cores_blight", elite: true, shield: 120, health: 1.5, damage: 1.3, xp: 1.8, plate: "joint" },

  // Named targets: Borderlands' wanted posters. Each is hunted by one side quest, which puts it in the world.
  { id: "scald", name: "Scald", base: "scorch_husk", zone: "breakwater_shelf", named: true, elite: true, health: 6, damage: 1.4, scale: 1.25, xp: 6, plate: "opticElite" },
  { id: "gunner_vex", name: "Gunner Vex", base: "shelf_raider", zone: "breakwater_shelf", named: true, elite: true, shield: 120, health: 5, damage: 1.3, scale: 1.15, xp: 6, plate: "hazard" },
  { id: "gristle", name: "Gristle", base: "dust_ripper", zone: "arid_badlands", named: true, elite: true, health: 6, damage: 1.5, scale: 1.4, xp: 6, plate: "opticElite" },
  { id: "old_rivet", name: "Old Rivet", base: "nomad", zone: "split_ridge", named: true, elite: true, surface: "armor", health: 6, damage: 1.4, scale: 1.2, xp: 6, plate: "rust" },
  { id: "queen_skitter", name: "Queen Skitter", base: "brood_crawler", zone: "split_ridge", named: true, elite: true, health: 4, damage: 1.3, scale: 1.2, xp: 6, plate: "hazard" },
  { id: "lady_glass", name: "Lady Glass", base: "glass_husk", zone: "glasswind_flats", named: true, elite: true, shield: 300, health: 5, damage: 1.4, scale: 1.25, xp: 6, plate: "rimCool" },
  { id: "cinderjaw", name: "Cinderjaw", base: "slag_loader", zone: "cores_blight", named: true, elite: true, health: 5, damage: 1.4, scale: 1.2, xp: 6, plate: "opticElite" },
  { id: "foreman_krell", name: "Foreman Krell", base: "loader_war", zone: "cores_blight", named: true, elite: true, shield: 250, health: 4, damage: 1.3, scale: 1.2, xp: 6, plate: "hazard" },
];
