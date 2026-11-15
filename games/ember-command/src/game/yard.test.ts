import { beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { createNoticeFeed } from "@jgengine/core/notifications/notices";

import { combatantDef, DECOR, isNode, missingChamber } from "./catalog";
import { paintTrail } from "./commands";
import {
  advanceHazards,
  BEAM_GRACE,
  createHazardState,
  darknessAt,
  densestKnot,
  inSprinklerJet,
  MOWER_FIRST,
  MOWER_WARNING,
  mowerPosition,
  NO_HAZARDS,
  rainingAt,
  RAIN_FIRST,
  SKIRMISH_HAZARDS,
  SPRINKLER_CYCLE,
  SPRINKLER_ON,
  underBeam,
  underMower,
  type HazardEvent,
} from "./hazards";
import { dueTips } from "./coach";
import { laneEscape, skirmishHazardsFor, sprinklerWarming, SPRINKLER_WARMUP, sunBaked } from "./hazards";
import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";
import frontYardJson from "../frontyard.scene.json";
import {
  alarmDamageFactor, createTrailField, decayTrails, deposit, paintLine, pruneAlarms, raiseAlarm, scentAt, trailSpeedFactor, washTrails,
  type AlarmPulse,
} from "./pheromone";
import { resetSession, session } from "./session";
import { TRAIL_PAINT_COST } from "./tuning";
import { carShadeAt, inShade, onHose, onHotPavement, onPatio, readYardLayout, type YardLayout } from "./yard";
import { YARD } from "./yardInstance";
import { editorLayers } from "../editorLayers";

const BOUNDS = { minX: -48, minZ: -48, maxX: 48, maxZ: 48 };

describe("pheromone trails", () => {
  test("a painted line scents every cell it crosses and nothing beside it", () => {
    const field = createTrailField(BOUNDS, 2);
    expect(paintLine(field, 0, 0, 20, 0, 1)).toBeGreaterThan(8);
    expect(scentAt(field, 10, 0.5)).toBe(1);
    expect(scentAt(field, 10, 8)).toBe(0);
  });

  test("a line is clipped to its maximum length", () => {
    const field = createTrailField(BOUNDS, 2);
    paintLine(field, 0, 0, 40, 0, 1, 10);
    expect(scentAt(field, 9, 0.5)).toBe(1);
    expect(scentAt(field, 30, 0.5)).toBe(0);
  });

  test("hauling deposits accumulate up to the cap, and scent halves over its half-life", () => {
    const field = createTrailField(BOUNDS, 2);
    for (let i = 0; i < 10; i += 1) deposit(field, 5, 5, 0.3);
    expect(scentAt(field, 5, 5)).toBe(1);
    decayTrails(field, 90, 90);
    expect(scentAt(field, 5, 5)).toBeCloseTo(0.5, 5);
    // Rain multiplies the decay: the same 90 s in a storm leaves almost nothing.
    decayTrails(field, 90, 90, 6);
    expect(scentAt(field, 5, 5)).toBe(0);
  });

  test("the sprinkler washes out only the cells it lands on", () => {
    const field = createTrailField(BOUNDS, 2);
    paintLine(field, -20, 0, 20, 0, 1);
    washTrails(field, (x) => x > 0);
    expect(scentAt(field, -10, 0.5)).toBe(1);
    expect(scentAt(field, 10, 0.5)).toBe(0);
  });

  test("a red ant on full scent runs 40% faster", () => {
    expect(trailSpeedFactor(0, 0.4)).toBe(1);
    expect(trailSpeedFactor(1, 0.4)).toBeCloseTo(1.4, 5);
  });
});

describe("the authored backyard", () => {
  test("the scene carries the hose, two crossings, the sprinkler, the mower lane, patio stones and shade", () => {
    expect(YARD.hose?.points.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(YARD.crossings.length).toBe(2);
    expect(YARD.sprinkler).not.toBeNull();
    expect(YARD.mowerLane).not.toBeNull();
    expect(YARD.patios.length).toBeGreaterThanOrEqual(3);
    expect(YARD.shade.length).toBeGreaterThanOrEqual(3);
    expect(readYardLayout(editorLayers)).toEqual(YARD);
  });

  test("the hose body is slow ground but its crossings are not", () => {
    const crossing = YARD.crossings[0]!;
    expect(onHose(YARD, crossing.x, crossing.z)).toBe(false);
    const a = YARD.hose!.points[3]!;
    const b = YARD.hose!.points[4]!;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    expect(onHose(YARD, mid.x, mid.z)).toBe(true);
    expect(onHose(YARD, 0, 36)).toBe(false);
  });

  test("patio stones and shade read as regions", () => {
    const slab = YARD.patios[0]!;
    expect(onPatio(YARD, slab.x, slab.z)).toBe(true);
    expect(onPatio(YARD, slab.x + slab.halfX + 2, slab.z)).toBe(false);
    const shade = YARD.shade[0]!;
    expect(inShade(YARD, shade.x, shade.z)).toBe(true);
  });

  test("the two nests start out of the mower's lane", () => {
    const nest = editorLayers.markers.find((m) => m.catalogId === "keep_player")!;
    const lane = YARD.mowerLane!;
    expect(Math.abs(nest.position.z - lane.from.z)).toBeGreaterThan(lane.halfWidth + 4);
  });
});

/** A flat yard with a sprinkler at the origin spraying due +Z, and a mower lane along z = 10. */
const TEST_YARD: YardLayout = {
  hose: null,
  crossings: [],
  sprinkler: { x: 0, z: 0, reach: 20, arcFrom: 0, arcTo: 0 },
  mowerLane: { from: { x: -50, z: 10 }, to: { x: 50, z: 10 }, halfWidth: 4 },
  patios: [],
  shade: [{ x: 30, z: 30, radius: 5 }],
};

function run(state: ReturnType<typeof createHazardState>, seconds: number, step = 0.5, target: { x: number; z: number } | null = null): HazardEvent[] {
  const events: HazardEvent[] = [];
  for (let t = 0; t < seconds; t += step) events.push(...advanceHazards(state, TEST_YARD, step, target));
  return events;
}

describe("the yard's hazards", () => {
  test("the sprinkler rests, then sprays, and only what is in its jet gets wet", () => {
    const state = createHazardState({ ...NO_HAZARDS, sprinkler: true });
    run(state, SPRINKLER_CYCLE - SPRINKLER_ON - 1);
    expect(state.sprinkler.on).toBe(false);
    expect(inSprinklerJet(state, TEST_YARD, 0, 10)).toBe(false);
    const events = run(state, 2);
    expect(events).toContainEqual({ kind: "sprinkler", on: true });
    expect(inSprinklerJet(state, TEST_YARD, 0, 10)).toBe(true);
    expect(inSprinklerJet(state, TEST_YARD, 0, -10)).toBe(false);
    expect(inSprinklerJet(state, TEST_YARD, 0, 30)).toBe(false);
  });

  test("the mower warns, crosses its lane killing what is under the deck, then comes back later", () => {
    const state = createHazardState({ ...NO_HAZARDS, mower: true });
    const warned = run(state, MOWER_FIRST - MOWER_WARNING + 0.5);
    expect(warned).toContainEqual({ kind: "mowerWarning" });
    expect(underMower(state, TEST_YARD, -50, 10)).toBe(false);
    const started = run(state, MOWER_WARNING);
    expect(started).toContainEqual({ kind: "mowerStart" });
    const deck = mowerPosition(state, TEST_YARD)!;
    expect(underMower(state, TEST_YARD, deck.x, 10)).toBe(true);
    expect(underMower(state, TEST_YARD, deck.x, 20)).toBe(false);
    expect(underMower(state, TEST_YARD, deck.x + 20, 10)).toBe(false);
    const done = run(state, 10);
    expect(done).toContainEqual({ kind: "mowerDone" });
    expect(state.mower.direction).toBe(-1);
    expect(state.mower.nextAt).toBeGreaterThan(state.t);
  });

  test("rain and night run on their own clocks", () => {
    expect(rainingAt(RAIN_FIRST - 1)).toBe(false);
    expect(rainingAt(RAIN_FIRST + 1)).toBe(true);
    // A storm (The Downpour) rains within the first half-minute and pours for most of every minute after.
    expect(rainingAt(30)).toBe(false);
    expect(rainingAt(30, true)).toBe(true);
    let wet = 0;
    for (let t = 20; t < 140; t += 1) if (rainingAt(t, true)) wet += 1;
    expect(wet / 120).toBeGreaterThan(0.75);
    expect(darknessAt(30)).toBe(0);
    expect(darknessAt(200)).toBe(1);
  });

  test("the beam drags toward its prey, burns only while focused, and never in shade", () => {
    const state = createHazardState({ ...NO_HAZARDS, beam: true });
    run(state, BEAM_GRACE + 1, 0.5, { x: 10, z: 0 });
    expect(state.beam.focused).toBe(true);
    expect(state.beam.x).toBeCloseTo(10, 0);
    expect(underBeam(state, TEST_YARD, 10, 0)).toBe(true);
    expect(underBeam(state, TEST_YARD, -10, 0)).toBe(false);
    state.beam.x = 30;
    state.beam.z = 30;
    expect(underBeam(state, TEST_YARD, 30, 30)).toBe(false);
  });

  test("the beam hunts the densest knot of ants in the open", () => {
    const knot = densestKnot([{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: -1, z: 0 }, { x: 20, z: 20 }, { x: 30, z: 30 }, { x: 31, z: 30 }, { x: 30, z: 31 }, { x: 29, z: 30 }], TEST_YARD);
    expect(knot === null ? null : Math.hypot(knot.x, knot.z)).toBeLessThan(3);
  });

  test("the front yard is a full lawn: both nests, a roster, food, the mailbox wasps and its landmarks", () => {
    const doc = normalizeEditorLayers(frontYardJson as unknown as EditorDocument);
    const ids = (catalogId: string) => doc.markers.filter((m) => m.catalogId === catalogId).length;
    for (const id of ["keep_player", "keep_enemy", "hero", "wasp_nest", "gnome", "mailbox", "popsicle"]) expect(ids(id)).toBeGreaterThanOrEqual(1);
    expect(ids("worker")).toBeGreaterThanOrEqual(3);
    for (const marker of doc.markers) {
      if (marker.kind === "poi") continue;
      const id = marker.catalogId ?? "";
      expect(combatantDef(id) !== null || isNode(id) || DECOR.has(id)).toBe(true);
    }
    const front = readYardLayout(doc);
    expect(front.hot.length).toBe(1);
    expect(front.cracks.length).toBeGreaterThanOrEqual(3);
    expect(front.obstacles.length).toBeGreaterThanOrEqual(3);
    expect(front.hose).toBeNull();
  });

  test("the front yard's driveway bakes ants by day, except on a crack, in the car's moving shade or at night", () => {
    const front = readYardLayout(normalizeEditorLayers(frontYardJson as unknown as EditorDocument));
    const state = createHazardState({ ...NO_HAZARDS, heat: true });
    const crack = front.cracks[0]!.points[1]!;
    expect(onHotPavement(front, 0, 40)).toBe(true);
    expect(sunBaked(state, front, 12, 40)).toBe(true);
    expect(sunBaked(state, front, crack.x, crack.z)).toBe(false);
    expect(sunBaked(state, front, -30, 30)).toBe(false);
    const shade = carShadeAt(front, state.t)!;
    expect(sunBaked(state, front, shade.x, shade.z)).toBe(false);
    // The car's shade moves with the sun.
    expect(carShadeAt(front, 35)!.x).not.toBeCloseTo(carShadeAt(front, 0)!.x, 1);
    state.dark = 1;
    expect(sunBaked(state, front, 12, 40)).toBe(false);
  });

  test("a skirmish runs every clock its lawn has the landmark for, never the boss", () => {
    expect(SKIRMISH_HAZARDS.beam).toBe(false);
    expect(skirmishHazardsFor(YARD)).toEqual({ heat: false, sprinkler: true, mower: true, rain: true, night: true, beam: false });
    const front = readYardLayout(normalizeEditorLayers(frontYardJson as unknown as EditorDocument));
    expect(skirmishHazardsFor(front)).toEqual({ heat: true, sprinkler: false, mower: false, rain: true, night: true, beam: false });
  });
});

describe("castes and the pheromone verb", () => {
  beforeEach(() => resetSession());

  test("the tank beetle needs both a Barracks and a Nursery; the scout needs neither", () => {
    expect(missingChamber("beetle", new Set())).toBe("barracks");
    expect(missingChamber("beetle", new Set(["barracks"]))).toBe("nursery");
    expect(missingChamber("beetle", new Set(["barracks", "nursery"]))).toBeNull();
    expect(missingChamber("scout", new Set())).toBeNull();
  });

  function wallet(sugar: number): { ctx: GameContext; balance: () => number } {
    const balances: Record<string, number> = { sugar };
    const positions = new Map<string, EntityPosition>([["s1", [0, 0, 0]]]);
    const ctx = {
      player: { userId: "commander" },
      scene: { entity: { get: (id: string) => (positions.has(id) ? { id, position: positions.get(id)! } : null) } },
      game: {
        audio: { play: () => {} },
        notices: createNoticeFeed(),
        economy: {
          balance: (_u: string, c: string) => balances[c] ?? 0,
          charge: (_u: string, c: string, a: number) => { balances[c] = (balances[c] ?? 0) - a; return null; },
        },
      },
    } as unknown as GameContext;
    return { ctx, balance: () => balances["sugar"] ?? 0 };
  }

  test("a Pheromone Line runs from the selected ants to the click and costs sugar", () => {
    session.units.set("s1", { id: "s1", catalogId: "soldier", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    const { ctx, balance } = wallet(100);
    expect(paintTrail(ctx, ["s1"], 0, 20)).toBe(true);
    expect(scentAt(session.trails, 0.5, 10)).toBe(1);
    expect(balance()).toBe(100 - TRAIL_PAINT_COST);
  });

  test("a Pheromone Line is refused without the sugar for it", () => {
    session.units.set("s1", { id: "s1", catalogId: "soldier", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    const { ctx } = wallet(TRAIL_PAINT_COST - 1);
    expect(paintTrail(ctx, ["s1"], 0, 20)).toBe(false);
    expect(scentAt(session.trails, 0.5, 10)).toBe(0);
    expect(ctx.game.notices.list().at(-1)?.tone).toBe("deny");
  });
});

describe("alarm scent, hazard tells and the coach", () => {
  test("an alarm cloud makes nearby red ants bite 25% harder until it fades", () => {
    const alarms: AlarmPulse[] = [];
    raiseAlarm(alarms, 0, 0, 10);
    expect(alarmDamageFactor(alarms, 3, 0, 11)).toBeCloseTo(1.25, 5);
    expect(alarmDamageFactor(alarms, 30, 0, 11)).toBe(1);
    expect(alarmDamageFactor(alarms, 3, 0, 16)).toBe(1);
    pruneAlarms(alarms, 16);
    expect(alarms).toHaveLength(0);
  });

  test("the sprinkler hisses for a few seconds before it sprays", () => {
    const state = createHazardState({ ...NO_HAZARDS, sprinkler: true });
    run(state, SPRINKLER_CYCLE - SPRINKLER_ON - SPRINKLER_WARMUP + 1);
    expect(sprinklerWarming(state, TEST_YARD)).toBe(true);
    expect(state.sprinkler.on).toBe(false);
  });

  test("a black ant in the mower lane runs out on its own side", () => {
    expect(laneEscape(TEST_YARD, 5, 8)!.z).toBeLessThan(10 - 4);
    expect(laneEscape(TEST_YARD, 5, 12)!.z).toBeGreaterThan(10 + 4);
    expect(laneEscape(TEST_YARD, 5, 30)).toBeNull();
  });

  test("the coach names the next verb once, at the moment it matters", () => {
    const base = { elapsed: 0, foraging: 0, scented: false, trailPainted: false, hasBarracks: false, broodFull: false, night: false, enemySeen: false, beam: false, wasps: false, skirmish: false };
    expect(dueTips(base, []).map((t) => t.id)).toEqual([]);
    expect(dueTips({ ...base, elapsed: 7 }, []).map((t) => t.id)).toEqual(["forage"]);
    expect(dueTips({ ...base, elapsed: 7 }, ["forage"])).toEqual([]);
    expect(dueTips({ ...base, elapsed: 30, foraging: 3, scented: true }, ["forage"]).map((t) => t.id)).toEqual(["trail"]);
    expect(dueTips({ ...base, elapsed: 30, foraging: 3, scented: true, trailPainted: true }, ["forage"])).toEqual([]);
  });
});
