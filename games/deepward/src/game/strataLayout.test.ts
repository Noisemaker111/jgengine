import { describe, expect, test } from "bun:test";
import { BAYS, EXIT, FABRICATOR, GARAGE, FAUNA, FRAGMENTS, HAZARDS, HOME_SPAWN, LIFTS, NODES, PRINTER_ZERO, SALVAGE, STASH, STRATUM_SPAWNS, SUPPLIES, VAULT_SPAWN, distance, walkable, type Place, type Point } from "../world";
import { findRoute } from "./navigation";
import { STRATUM_ORDER, type Stratum } from "./strata";

const lift = (id: string) => LIFTS.find(entry => entry.id === id);
const spawnOf = (place: Stratum): Point => STRATUM_SPAWNS[place]!;

/** A walkable spot within 1.5 m of the anchor (the anchor itself when it is walkable). */
function standPoint(at: Point, place: Place): Point | null {
  if (walkable(at[0], at[2], place)) return at;
  for (let r = 0.25; r <= 1.5; r += 0.25) for (let a = 0; a < 16; a++) {
    const x = at[0] + Math.cos(a * Math.PI / 8) * r, z = at[2] + Math.sin(a * Math.PI / 8) * r;
    if (walkable(x, z, place)) return [x, 0, z];
  }
  return null;
}
function reachable(from: Point, to: Point, place: Place): boolean {
  const stand = standPoint(to, place);
  return stand !== null && findRoute(from, stand, place).length > 0;
}

describe("authored strata layout", () => {
  test("lifts and stratum spawns parse with the right destinations", () => {
    const expected: Record<string, [Stratum, Stratum]> = {
      "lift-vault-down": ["vault", "cold"], "lift-cold-up": ["cold", "vault"], "lift-cold-down": ["cold", "wells"],
      "lift-wells-up": ["wells", "cold"], "lift-wells-down": ["wells", "choir"], "lift-choir-up": ["choir", "wells"],
    };
    for (const [id, [place, to]] of Object.entries(expected)) {
      expect(lift(id)?.place).toBe(place);
      expect(lift(id)?.to).toBe(to);
    }
    for (const place of STRATUM_ORDER) expect(STRATUM_SPAWNS[place]).toBeDefined();
  });

  test("every anchor, node, supply, fragment and creature stands on walkable floor", () => {
    for (const entry of [...LIFTS, ...NODES, ...SUPPLIES, ...FRAGMENTS, ...FAUNA]) expect([entry.id, walkable(entry.at[0], entry.at[2], entry.place)]).toEqual([entry.id, true]);
    for (const place of STRATUM_ORDER) { const at = spawnOf(place); expect(walkable(at[0], at[2], place)).toBe(true); }
    expect(walkable(FABRICATOR[0], FABRICATOR[2], "home")).toBe(true);
    expect(walkable(PRINTER_ZERO[0], PRINTER_ZERO[2], "choir")).toBe(true);
    expect(BAYS).toHaveLength(6);
    for (const bay of BAYS) for (const [dx, dz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]] as const)
      expect([bay.id, dx, dz, walkable(bay.at[0] + dx, bay.at[2] + dz, "home")]).toEqual([bay.id, dx, dz, true]);
  });

  test("Marrow's bays and fabricator keep clear of each other and the home services", () => {
    const fixed = [STASH, HOME_SPAWN, FABRICATOR];
    for (const bay of BAYS) {
      for (const other of fixed) expect(distance(bay.at, other)).toBeGreaterThanOrEqual(2.6);
      for (const other of BAYS) if (other !== bay) expect(distance(bay.at, other.at)).toBeGreaterThanOrEqual(2.6);
    }
    expect(distance(FABRICATOR, STASH)).toBeGreaterThanOrEqual(2.5);
    expect(findRoute(HOME_SPAWN, GARAGE, "home")).toEqual([GARAGE]);
    expect(findRoute(HOME_SPAWN, FABRICATOR, "home").length).toBeGreaterThan(0);
  });

  test("every interactable is reachable on foot from its stratum's spawn", () => {
    const goal = { id: "printer-zero", place: "choir" as Stratum, at: PRINTER_ZERO };
    for (const entry of [...LIFTS, ...NODES, ...SUPPLIES, ...FRAGMENTS, goal]) {
      const starts = entry.place === "vault" ? [VAULT_SPAWN, spawnOf("vault")] : [spawnOf(entry.place)];
      for (const start of starts) expect([entry.id, reachable(start, entry.at, entry.place)]).toEqual([entry.id, true]);
    }
  });

  test("hazards belong to a stratum and each down lift is far from its up lift", () => {
    for (const hazard of HAZARDS) expect(STRATUM_ORDER).toContain(hazard.place);
    const pairs: [string, string][] = [["lift-cold-up", "lift-cold-down"], ["lift-wells-up", "lift-wells-down"]];
    for (const [up, down] of pairs) expect(distance(lift(up)!.at, lift(down)!.at)).toBeGreaterThanOrEqual(20);
    expect(distance(spawnOf("vault"), lift("lift-vault-down")!.at)).toBeLessThan(2);
    expect(distance(VAULT_SPAWN, lift("lift-vault-down")!.at)).toBeGreaterThanOrEqual(20);
  });

  test("existing receiving anchors stay walkable", () => {
    expect(walkable(VAULT_SPAWN[0], VAULT_SPAWN[2], "vault")).toBe(true);
    expect(walkable(EXIT[0], EXIT[2], "vault")).toBe(true);
    for (const loot of SALVAGE) expect(walkable(loot.at[0], loot.at[2], loot.place)).toBe(true);
  });
});
