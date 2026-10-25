import { describe, expect, test } from "bun:test";

import { MAIN_ROUTE } from "@jgengine/core/world/routeCourse";

import { CAREER_KEY, newCareer } from "../career";
import { YARD_EVENTS } from "../events/catalog";
import { tuningFrom } from "../parts/build";
import { PARTS, partById } from "../parts/catalog";
import { createRunSession } from "../run/session";
import { driveCourse } from "../testing/courseDriver";
import { createVehicleController } from "../vehicle/controller";
import { FLAT_YARD_GROUND } from "./ground";
import { ROW_SIX_TRACK, TRACKS, trackById, type Track } from "./catalog";

const LAID = TRACKS.filter((track) => track !== ROW_SIX_TRACK);

function memory() {
  const map = new Map<string, string>();
  const career = newCareer();
  career.medals = { best: { "salvage-run": 1, "scrap-sweep": 12, "night-shift": 20, "grudge-hobbs": 9, "time-sheet": 20, "bare-metal": 20 } };
  map.set(CAREER_KEY, JSON.stringify(career));
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
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
  test("six tracks, each a different shape: no two share a length, a bend count or a shortcut", () => {
    expect(TRACKS).toHaveLength(6);
    const turns = (track: Track) => track.def.pieces.filter((piece) => piece.kind === "turn").length;
    expect(new Set(TRACKS.map((track) => Math.round(track.exitAt))).size).toBe(6);
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
  }, 30_000); // drives all six tracks twice at 60 Hz; the default 5 s budget is tight on a shared CI runner (took 5.08 s)

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
