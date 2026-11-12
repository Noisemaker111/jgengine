import { describe, expect, test } from "bun:test";

import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";

import { memorySaveBackend } from "@jgengine/core/save/saveStore";

import { newCareer } from "../career";
import { createFoundrySave } from "../foundrySave";
import { YARD_EVENTS } from "../events/catalog";
import { tuningFrom } from "../parts/build";
import { PARTS, partById } from "../parts/catalog";
import { createRunSession } from "../run/session";
import { driveCourse } from "../testing/courseDriver";
import { createVehicleController } from "../vehicle/controller";
import { FLAT_YARD_GROUND } from "./ground";
import type { SessionSnapshot } from "../run/session";
import { createCoursePilot } from "../testing/courseDriver";
import { buildTrack, REROUTE_DAY, rerouteTrackDef, ROW_SIX_TRACK, TRACKS, trackById, type Track } from "./catalog";

const LAID = TRACKS.filter((track) => track !== ROW_SIX_TRACK);

/**
 * The five hand-made courses as they were laid from TypeScript piece lists, before they moved into
 * editor.scene.json as `course` markers: main-line length, each shortcut (main-line from, to, its own
 * length), each barricade (route, run metres) and each hazard (route, course metres).
 */
const AUTHORED: Readonly<Record<string, { length: number; branches: readonly (readonly [string, number, number, number])[]; gates: readonly (readonly [string, string, number])[]; hazards: readonly (readonly [string, string, number, number])[] }>> = {
  "slag-river": {
    length: 779.5,
    branches: [["ladle-bridge", 183, 311, 88.6]],
    gates: [["slag_plow_crust", "main", 108], ["slag_jump_ladle", "ladle-bridge", 187], ["slag_jump_skimmer", "main", 388], ["slag_plow_pigs", "main", 455], ["slag_jump_trough", "main", 618], ["slag_plow_shed", "main", 668]],
    hazards: [["spurt-pool", "main", 238, 254], ["spurt-mid-1", "main", 468, 480], ["spurt-mid-2", "main", 538, 550], ["spurt-last", "main", 700, 712], ["hairpin-1", "main", 329, 404], ["hairpin-2", "main", 564, 640]],
  },
  "rail-yard": {
    length: 837.5,
    branches: [["shed-cut", 394, 549, 107.7]],
    gates: [["rail_plow_sleepers", "main", 108], ["rail_jump_buffer", "main", 252], ["rail_plow_shed", "shed-cut", 405], ["rail_plow_container", "main", 598], ["rail_jump_last", "main", 735]],
    hazards: [["crossing-a", "main", 270, 278], ["crossing-b", "main", 672, 680], ["shed-oil", "shed-cut", 18, 100]],
  },
  "smelter-climb": {
    length: 806.1,
    branches: [["tapping-floor", 656, 763, 86.2]],
    gates: [["smelt_plow_moulds", "main", 108], ["smelt_jump_ramp", "main", 190], ["smelt_plow_scrap", "main", 400], ["smelt_jump_rail", "main", 455], ["smelt_plow_tap", "tapping-floor", 640]],
    hazards: [["pour-ramp-1", "main", 285, 296], ["pour-pin-1", "main", 352, 368], ["pour-ramp-2", "main", 485, 496], ["pour-pin-2", "main", 572, 588], ["pour-tap", "tapping-floor", 34, 46]],
  },
  "conveyor-maze": {
    length: 850.8,
    branches: [["belt-hall", 163, 284, 89.5]],
    gates: [["belt_plow_pallets", "main", 92], ["belt_jump_hall", "belt-hall", 160], ["belt_jump_feed", "main", 275], ["belt_plow_bales", "main", 430], ["belt_jump_sorter", "main", 600], ["belt_plow_shutter", "main", 690]],
    hazards: [["hall-belt", "belt-hall", 6, 70], ["long-way-belt", "main", 200, 246], ["feed-belt", "main", 312, 358], ["return-belt", "main", 466, 522], ["sorter-belt", "main", 630, 696], ["out-belt", "main", 772, 820]],
  },
  "flooded-quarry": {
    length: 882.2,
    branches: [["pit-wade", 519, 636, 82.6]],
    gates: [["pit_plow_spoil", "main", 108], ["pit_jump_ramp", "main", 200], ["pit_plow_pump", "main", 322], ["pit_jump_crusher", "main", 596], ["pit_plow_rockfall", "main", 700], ["pit_jump_rim", "main", 772]],
    hazards: [["flood-south", "main", 352, 413], ["flood-floor", "main", 476, 516], ["flood-exit", "main", 639, 672], ["pool", "pit-wade", 4, 78]],
  },
};

/** A yard save in memory whose career has every tier open. */
function memory() {
  const career = newCareer();
  career.medals = { best: { "salvage-run": 1, "scrap-sweep": 12, "night-shift": 20, "grudge-hobbs": 9, "time-sheet": 20, "bare-metal": 20 } };
  return createFoundrySave(memorySaveBackend(), { career });
}

function eventOn(track: Track) {
  return YARD_EVENTS.find((event) => event.track === track.id)!;
}

function runOn(track: Track, take: readonly string[] = [], sweep = false) {
  const session = createRunSession(() => 0, memory());
  expect(session.selectEvent(eventOn(track).id)).toEqual({ ok: true });
  session.start();
  driveCourse(session, { take, sweep });
  return session.snapshot();
}

describe("yard tracks", () => {
  test("seven tracks, each a different shape: no two share a length, a bend count or a shortcut", () => {
    expect(TRACKS).toHaveLength(7);
    const turns = (track: Track) => track.def.pieces.filter((piece) => piece.kind === "turn").length;
    expect(new Set(TRACKS.map((track) => Math.round(track.exitAt))).size).toBe(7);
    expect(new Set(LAID.map(turns)).size).toBeGreaterThanOrEqual(4);
    for (const track of LAID) expect(track.def.branches.length).toBeGreaterThan(0);
  });

  test("no leg of a track runs into another, and no two tracks share ground", () => {
    for (const track of LAID) {
      const samples: { x: number; z: number; route: string; s: number; hw: number }[] = [];
      for (const route of track.course.routes) {
        for (let s = 0; s <= route.length; s += 2) {
          const point = track.course.pointAt(route.id, s);
          samples.push({ x: point.x, z: point.z, route: route.id, s: route.id === MAIN_ROUTE ? s : route.from + (s / route.length) * (route.to - route.from), hw: point.halfWidth });
        }
      }
      for (let i = 0; i < samples.length; i += 1) {
        for (let j = i + 1; j < samples.length; j += 1) {
          const a = samples[i]!;
          const b = samples[j]!;
          // Neighbours along the road, and a shortcut where it leaves and rejoins the main line, touch by design.
          if (Math.abs(a.s - b.s) < (a.hw + b.hw) * 2.5) continue;
          if (a.route !== b.route && (a.route === MAIN_ROUTE || b.route === MAIN_ROUTE)) {
            const branch = track.course.routes.find((route) => route.id === (a.route === MAIN_ROUTE ? b.route : a.route))!;
            const mainS = a.route === MAIN_ROUTE ? a.s : b.s;
            if (mainS > branch.from - 30 && mainS < branch.to + 30) continue;
          }
          const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.hw - b.hw;
          if (gap < 4) throw new Error(`${track.id}: ${a.route}@${a.s.toFixed(0)} and ${b.route}@${b.s.toFixed(0)} are ${gap.toFixed(1)} m apart`);
        }
      }
    }
    const boxes = TRACKS.map((track) => track.course.bounds);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart = Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ, b.minX - a.maxX, a.minX - b.maxX);
        expect(apart).toBeGreaterThan(120);
      }
    }
  });

  test("each track hands over the plow and springs before its first gate and its first shortcut", () => {
    for (const track of TRACKS) {
      const at = (partId: string) => track.pickups.find((pickup) => pickup.partId === partId)!.at;
      const fork = Math.min(Number.POSITIVE_INFINITY, ...track.def.branches.map((branch) => branch.from));
      const first = (requirement: string) =>
        Math.min(fork, ...track.gates.filter((gate) => gate.requirement === requirement).map((gate) => (gate.route === MAIN_ROUTE ? gate.atZ : track.def.branches.find((b) => b.id === gate.route)!.from)));
      expect(at("plow_blade")).toBeLessThan(first("plow"));
      expect(at("coil_springs")).toBeLessThan(first("jump"));
    }
  });

  test("one drop per part on every track, and every gate, drop and hazard sits on its route", () => {
    for (const track of TRACKS) {
      expect(track.pickups).toHaveLength(PARTS.length);
      expect(new Set(track.pickups.map((pickup) => pickup.partId)).size).toBe(PARTS.length);
      for (const pickup of track.pickups) expect(track.locate(pickup.position[0], pickup.position[2]).inside).toBe(true);
      for (const gate of track.gates) {
        const route = track.course.routes.find((entry) => entry.id === gate.route)!;
        const s = track.sOf(gate.route, gate.atZ);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(route.length);
      }
      for (const span of track.hazardSpans) {
        const route = track.course.routes.find((entry) => entry.id === span.route)!;
        expect(span.to).toBeLessThanOrEqual(route.length);
      }
      expect(track.exitAt).toBeLessThan(track.end);
    }
  });

  test("every track can be driven to its gate, and its shortcut is the faster line", () => {
    for (const track of LAID) {
      const long = runOn(track);
      expect(long.phase).toBe("won");
      const short = runOn(track, track.def.branches.map((branch) => branch.id));
      expect(short.phase).toBe("won");
      if (track.id !== "flooded-quarry") expect(short.runTime).toBeLessThan(long.runTime - 1.5);
      // The pit wade trades the deep pool for distance: no faster, never much slower.
      else expect(short.runTime).toBeLessThan(long.runTime + 1);
    }
  }, 90_000); // drives every laid track twice at 60 Hz: ~8 s alone, 37 s on a loaded four-core runner

  test("a gate on a shortcut only stops karts on that shortcut", () => {
    const track = trackById("rail-yard")!;
    const shed = track.gates.find((gate) => gate.route === "shed-cut")!;
    const noPlow = tuningFrom([partById("coil_springs")!]);
    const run = shed.atZ - 8;
    const onBranch = track.point("shed-cut", run);
    const heading = onBranch.heading;
    const kart = createVehicleController({ position: [onBranch.x, onBranch.elevation, onBranch.z], heading }, track);
    let pose = kart.tick(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, noPlow, { jumpPressed: false, plowBracing: false }, FLAT_YARD_GROUND);
    for (let i = 0; i < 180; i += 1) pose = kart.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, noPlow, { jumpPressed: false, plowBracing: false }, FLAT_YARD_GROUND);
    expect(pose.route).toBe("shed-cut");
    expect(pose.blockedByGate).toBe(true);
    expect(pose.run!).toBeLessThanOrEqual(shed.atZ + 0.01);
    // The same kart on the main line beside the shortcut drives on: that wall is not its wall.
    const beside = track.point(MAIN_ROUTE, run);
    const main = createVehicleController({ position: [beside.x, beside.elevation, beside.z], heading: beside.heading }, track);
    let free = main.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, noPlow, { jumpPressed: false, plowBracing: false }, FLAT_YARD_GROUND);
    for (let i = 0; i < 180; i += 1) free = main.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, noPlow, { jumpPressed: false, plowBracing: false }, FLAT_YARD_GROUND);
    expect(free.route).toBe(MAIN_ROUTE);
    expect(free.run!).toBeGreaterThan(shed.atZ);
  });

  test("the scene's courses lay the five hand-made tracks exactly as their piece lists did", () => {
    for (const [id, want] of Object.entries(AUTHORED)) {
      const track = trackById(id)!;
      expect(Math.round(track.course.length * 10) / 10).toBe(want.length);
      expect(track.course.routes.slice(1).map((route) => [route.id, route.from, route.to, Math.round(route.length * 10) / 10])).toEqual(want.branches.map((entry) => [...entry]));
      expect(track.gates.map((gate) => [gate.id, gate.route, gate.atZ])).toEqual(want.gates.map((entry) => [...entry]));
      expect(track.hazardSpans.map((span) => [span.id, span.route, span.from, span.to])).toEqual(want.hazards.map((entry) => [...entry]));
    }
  });

  test("the Reroute is a new generated course every day, each one drivable, its shortcut faster and riskier", () => {
    const tuning = tuningFrom(PARTS);
    const days = Array.from({ length: 10 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`);
    const shapes = new Set<string>();
    for (const day of days) {
      const track = buildTrack(rerouteTrackDef(day));
      shapes.add(JSON.stringify(track.def.pieces));
      expect(track.def.branches).toHaveLength(1);
      expect(track.gates).toHaveLength(5);
      expect(track.gates.some((gate) => gate.dropsAt !== undefined)).toBe(true);
      expect(track.pickups).toHaveLength(PARTS.length);
      // The shortcut is a gamble: a barricade or a timed spill stands on it.
      const shortcut = track.def.branches[0]!.id;
      expect(track.gates.some((gate) => gate.route === shortcut) || track.hazardSpans.some((span) => span.route === shortcut && span.cycle !== undefined)).toBe(true);
      // Clear of every hand-made track's ground.
      for (const other of LAID.filter((entry) => entry.id !== "reroute")) {
        const a = track.course.bounds;
        const b = other.course.bounds;
        expect(Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ, b.minX - a.maxX, a.minX - b.maxX)).toBeGreaterThan(120);
      }
      const drive = (take: readonly string[]): number => {
        const pilot = createCoursePilot(track, { take });
        const kart = createVehicleController({ position: track.spawn.position, heading: track.spawn.heading }, track);
        let pose = kart.tick(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, tuning, { jumpPressed: false, plowBracing: true, time: 0 }, () => 0);
        for (let time = 0; time < 120; time += 1 / 60) {
          if ((pose.run ?? 0) >= track.exitAt) return time;
          // type-escape: the pilot reads only the pose, run, route, clock and drops of a session snapshot.
          const snap = { pose, run: pose.run ?? 0, route: pose.route ?? MAIN_ROUTE, runTime: time, collectedIds: new Set<string>() } as unknown as SessionSnapshot;
          const frame = pilot(snap);
          pose = kart.tick(1 / 60, { ...frame.axis, handbrake: 0 }, tuning, { jumpPressed: frame.input.jumpPressed, plowBracing: true, time }, () => 0);
        }
        throw new Error(`reroute ${day}: never reached the gate on ${take.join(",") || "the long way"} (stuck at ${pose.run?.toFixed(0)} m)`);
      };
      const long = drive([]);
      const short = drive([shortcut]);
      expect(short).toBeLessThan(long);
    }
    expect(shapes.size).toBe(days.length);
    expect(trackById("reroute")!.def).toEqual(rerouteTrackDef(REROUTE_DAY));
  }, 60_000); // ten generated courses, each driven twice at 60 Hz

  test("the rail yard's freight throws a kart back off the crossing", () => {
    const track = trackById("rail-yard")!;
    const crossing = track.hazardSpans.find((span) => span.kind === "train")!;
    const session = createRunSession(() => 0, memory());
    session.selectEvent(eventOn(track).id);
    session.start();
    // Floor it with no regard for the lights: sooner or later a train is on the crossing.
    const crossingRun = track.course.progressOf(crossing.route, crossing.from) - track.origin;
    let hit = false;
    let thrownTo = Number.POSITIVE_INFINITY;
    const original = session.tick.bind(session);
    session.tick = (dt, axis, input) => {
      original(dt, axis, input);
      const snap = session.snapshot();
      if (!hit && snap.ticker.some((line) => line.text.includes("FREIGHT"))) {
        hit = true;
        thrownTo = snap.run;
      }
    };
    driveCourse(session, { reckless: true, limit: 60 });
    expect(crossing.cycle).toBeDefined();
    expect(hit).toBe(true);
    expect(thrownTo).toBeLessThan(crossingRun);
  });

  test("hazards change the drive: slag slows, a belt shoves, a flood drags", () => {
    const tuning = tuningFrom([partById("salvage_v6")!]);
    const drive = (track: Track, run: number, offset: number, time: number, seconds = 1.5) => {
      const at = track.point(MAIN_ROUTE, run, offset);
      const kart = createVehicleController({ position: [at.x, at.elevation, at.z], heading: at.heading }, track);
      let pose = kart.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, tuning, { jumpPressed: false, plowBracing: false, time }, FLAT_YARD_GROUND);
      for (let t = 0; t < seconds; t += 1 / 60) pose = kart.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, tuning, { jumpPressed: false, plowBracing: false, time: time + t }, FLAT_YARD_GROUND);
      return pose;
    };
    const conveyor = trackById("conveyor-maze")!;
    const belt = conveyor.def.hazards.find((hazard) => hazard.kind === "belt" && (hazard.route ?? MAIN_ROUTE) === MAIN_ROUTE && hazard.offset === undefined)!;
    const onBelt = drive(conveyor, belt.from + 2, 0, 0, 1);
    const offBelt = drive(conveyor, belt.from - 40, 0, 0, 1);
    expect(onBelt.hazards?.some((hazard) => hazard.kind === "belt")).toBe(true);
    expect(onBelt.run! - (belt.from + 2)).not.toBeCloseTo(offBelt.run! - (belt.from - 40), 0);
    const quarry = trackById("flooded-quarry")!;
    const flood = quarry.def.hazards.find((hazard) => hazard.kind === "flood" && hazard.route === undefined)!;
    const wet = drive(quarry, flood.from + 1, 0, 0, 2);
    expect(wet.hazards?.some((hazard) => hazard.kind === "flood")).toBe(true);
    const dry = drive(quarry, flood.from - 50, 0, 0, 2);
    expect(wet.speedKmh).toBeLessThan(dry.speedKmh);
  });
});
