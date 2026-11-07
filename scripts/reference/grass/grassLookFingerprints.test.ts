/**
 * Fingerprints of every grass look the repo draws: each species, each game's authored grass volumes,
 * the demo's custom looks, the reference patches and 200 seeded random metas. A change that moves
 * any of them fails here and names the looks it moved. When a change means to move looks, rewrite
 * the fixture and say so in the PR:
 *
 *   GRASS_FINGERPRINTS=write bun test scripts/reference/grass/grassLookFingerprints.test.ts
 *
 * A fingerprint covers the knobs the fixture lists (`keys`), so style sliders added later leave
 * looks drawn at the default style unchanged.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { GRASS_REFERENCE_PHOTOS } from "../../../apps/dev/src/demo/grassReference";
import { flattenGrassLook, GRASS_SCHEMA, readGrassLook, type GrassLook } from "../../../packages/core/src/grass/grassKind";
import { GRASS_SPECIES } from "../../../packages/core/src/grass/grassSpecies";
import { grass } from "../../../packages/core/src/world/features";

const root = resolve(import.meta.dir, "../../..");
const FIXTURE = join(import.meta.dir, "grassLookFingerprints.json");

interface Fixture {
  keys: string[];
  looks: Record<string, string>;
}

/** Knobs that left the flat meta for the style group; random metas skip them so old and new draw the same metas. */
const MOVED_TO_STYLE = new Set(["normalLift"]);

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMetas(count: number): Record<string, unknown>[] {
  const random = mulberry32(2026);
  const metas: Record<string, unknown>[] = [];
  for (let index = 0; index < count; index += 1) {
    const meta: Record<string, unknown> = { seed: `random-${index}` };
    if (random() < 0.5) meta.species = GRASS_SPECIES[Math.floor(random() * GRASS_SPECIES.length)]!.id;
    for (const field of GRASS_SCHEMA.fields) {
      if (MOVED_TO_STYLE.has(field.key) || field.type === "seed") continue;
      if (random() > 0.3) continue;
      if (field.type === "range") meta[field.key] = field.min + random() * (field.max - field.min);
      else if (field.type === "color") meta[field.key] = `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, "0")}`;
    }
    metas.push(meta);
  }
  return metas;
}

function gameVolumeMetas(): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [];
  const games = join(root, "games");
  for (const game of readdirSync(games).sort()) {
    const scene = join(games, game, "src", "editor.scene.json");
    if (!existsSync(scene)) continue;
    const document = JSON.parse(readFileSync(scene, "utf8")) as { volumes?: { id: string; kind: string; meta?: Record<string, unknown> }[] };
    for (const volume of document.volumes ?? []) if (volume.kind === "grass_field") out.push([`${game}:${volume.id}`, volume.meta ?? {}]);
  }
  return out;
}

/** Code-side `grass()` bands, resolved through `environment()`'s own path (scrap-signal's scrub clumps). */
function bandLooks(): [string, GrassLook][] {
  return [
    ["band:scrap-signal-scrub", grass({ species: "desert-bunchgrass", colour: { baseColor: "#6e5a34", tipColor: "#b9a064" }, seed: "scrub-0", mix: { mixShare: 0.1, mixHeight: 2.1, mixColor: "#e2c878" } }).look],
    ["band:default", grass().look],
  ];
}

function cases(): [string, Record<string, unknown>][] {
  return [
    ...GRASS_SPECIES.map((species): [string, Record<string, unknown>] => [`species:${species.id}`, { species: species.id, seed: species.id }]),
    ...gameVolumeMetas(),
    ...GRASS_REFERENCE_PHOTOS.map((photo): [string, Record<string, unknown>] => [`reference:${photo.id}`, { species: photo.species, seed: photo.id }]),
    ["demo:moss-reed", { species: "sphagnum", mixShare: 0.12, mixHeight: 4, mixWidth: 1.5, mixColor: "#8a9a5a", seed: "moss-reed" }],
    ["demo:steppe", { bladeHeight: 0.7, bladeWidth: 0.02, profile: 0.05, twist: 0.6, splay: 0.3, lean: 0.5, baseColor: "#5a6a4a", tipColor: "#b8c0a0", flowerShare: 0.4,
      headShape: 0.8, flowerColor: "#9a7ad8", flowerColor2: "#c8a8f0", flowerSize: 0.05, windStrength: 0.5, seed: "steppe" }],
    ...randomMetas(200).map((meta, index): [string, Record<string, unknown>] => [`random:${index}`, meta]),
  ];
}

/** Every knob of a look flat, with any nested group (the style) lifted to the top. */
function flatKnobs(look: GrassLook): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...flattenGrassLook(look) };
  for (const [key, value] of Object.entries(flat)) {
    if (value !== null && typeof value === "object") {
      delete flat[key];
      Object.assign(flat, value);
    }
  }
  return flat;
}

function fingerprint(look: GrassLook, keys: readonly string[]): string {
  const flat = flatKnobs(look);
  return createHash("sha1").update(JSON.stringify(keys.map((key) => [key, flat[key]]))).digest("hex").slice(0, 16);
}

describe("grass look fingerprints", () => {
  test("every look the repo draws matches its fingerprint at the default style", () => {
    const all: [string, GrassLook][] = [...cases().map(([id, meta]): [string, GrassLook] => [id, readGrassLook(meta)]), ...bandLooks()];
    if (process.env.GRASS_FINGERPRINTS === "write") {
      const keys = Object.keys(flatKnobs(readGrassLook({}))).sort();
      const fixture: Fixture = { keys, looks: Object.fromEntries(all.map(([id, look]) => [id, fingerprint(look, keys)])) };
      writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
    const moved = all.filter(([id, look]) => fixture.looks[id] !== fingerprint(look, fixture.keys)).map(([id]) => id);
    expect(moved).toEqual([]);
    expect(all.map(([id]) => id).sort()).toEqual(Object.keys(fixture.looks).sort());
  });
});
