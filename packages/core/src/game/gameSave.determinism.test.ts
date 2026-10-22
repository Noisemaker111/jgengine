import { describe, expect, test } from "bun:test";

import { createPoliceResponse } from "../ai/policeResponse";
import { createUtilityBrain } from "../ai/utilityBrain";
import { createDamageRuntime } from "../combat/damageRuntime";
import { createLoanBook } from "../economy/loanBook";
import { createMarket } from "../economy/market";
import { createTransactionLedger } from "../economy/transactionLedger";
import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import { createInventorySet } from "../inventory/inventoryModel";
import { createLootRoller, type LootCatalog } from "../loot/lootGen";
import { createMissionRuntime, type MissionDef } from "../mission/mission";
import { createLaneGraph } from "../nav/laneGraph";
import { createNavCrowd } from "../nav/navCrowd";
import type { NavMeshData } from "../nav/navMesh";
import { createNavRuntime } from "../nav/navRuntime";
import { createTraffic } from "../nav/traffic";
import { createKinematicVehicle, type KinematicVehicleTuning } from "../physics/kinematicVehicle";
import { createVehicleDamage } from "../physics/vehicleDamage";
import { createSkillTree, type SkillTreeConfig } from "../progression/skillTree";
import { seededRng } from "../random/rng";
import { createPerception } from "../sensor/perception";
import { createNeedSet, type NeedDefinition } from "../sim/needs";
import { createNearAgents } from "../sim/nearAgents";
import { createOffScreenWorld, type OffScreenResidentSpec } from "../sim/offScreen";
import { resolveRoutine } from "../sim/routine";
import { createRideSystem } from "../sim/rides";
import { createGameSave, type GameSave } from "./gameSave";
import { memorySaveBackend, type SaveBackend } from "./saveStore";

const DT = 1 / 30;
const SEED = "b5.3-determinism";
const SAVE_TICK = 200;
const EXTRA_TICKS = 1_000;
const TOTAL_TICKS = SAVE_TICK + EXTRA_TICKS;

/** Every Lane B system the digest must cover, one document section each. */
const SYSTEM_NAMES = [
  "needs",
  "utilityBrain",
  "navCrowd",
  "offScreen",
  "routine",
  "perception",
  "traffic",
  "vehicles",
  "damage",
  "loot",
  "progression",
  "inventory",
  "missions",
  "economy",
  "police",
  "rides",
];

const NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, rate: 0.05 },
  { id: "energy", max: 100, rate: 0.03, start: 70 },
];

function gridMesh(cols: number, rows: number, size = 2): NavMeshData {
  const verts: number[] = [];
  for (let r = 0; r <= rows; r += 1) for (let c = 0; c <= cols; c += 1) verts.push(c * size, 0, r * size);
  const polys: number[][] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const a = r * (cols + 1) + c;
    polys.push([a, a + 1, a + cols + 2, a + cols + 1]);
  }
  return { verts, polys, links: [] };
}

const PLACES = { home: [4, 0, 4] as const, work: [20, 0, 4] as const, diner: [20, 0, 20] as const };

const ROUTINE = resolveRoutine({
  cycleSeconds: 240,
  stops: [
    { place: "home", arriveAt: 0, activity: "sleep", travelSeconds: 0 },
    { place: "work", arriveAt: 60, activity: "work", travelSeconds: 8 },
    { place: "diner", arriveAt: 150, activity: "meal", travelSeconds: 8 },
    { place: "home", arriveAt: 200, activity: "home", travelSeconds: 8 },
  ],
});

const RESIDENTS: readonly OffScreenResidentSpec[] = [
  { id: "cook", home: [4, 0, 4], routine: ROUTINE },
  { id: "clerk", home: [20, 0, 4], routine: ROUTINE },
  { id: "farmer", home: [20, 0, 20] },
  { id: "guard", home: [56, 0, 56] },
];

const LOOT_CATALOG: LootCatalog = {
  bases: [
    {
      id: "frame",
      name: "Frame",
      baseStats: { power: 10, reach: 30 },
      pools: ["edge"],
      slots: [{ id: "barrel", accepts: "barrel" }],
    },
  ],
  parts: [{ id: "barrel.long", category: "barrel", stats: { reach: 8 }, weight: 1, namePart: "Long" }],
  pools: [
    {
      id: "edge",
      affixes: [{ id: "keen", stat: "power", op: "add", roll: [2, 5], weight: 1, namePart: { position: "prefix", text: "Keen" } }],
    },
  ],
  rarities: [
    { id: "common", weight: 70, affixCount: 0 },
    { id: "rare", weight: 30, affixCount: 1, statScale: 1.2, namePart: "Rare" },
  ],
  manufacturers: [{ id: "voss", name: "Voss" }],
  levelScale: [
    [1, 1],
    [10, 1.5],
  ],
};

const MISSION: MissionDef = {
  id: "hold-the-line",
  title: "Hold the line",
  rollout: { fact: "flavor", options: ["dawn", "dusk", "rain"] },
  objectives: [{ id: "hold", kind: "survive", duration: 12, actor: "hero", next: "done" }],
};

const SKILL_TREE: SkillTreeConfig = {
  points: 12,
  nodes: [
    { id: "strike", branch: "offense", passives: { power: { add: 2 } } },
    { id: "cleave", branch: "offense", maxRank: 3, requires: [{ nodeId: "strike" }], passives: { power: { add: 3 } } },
    { id: "guard", branch: "defense", passives: { armor: { add: 4 } } },
  ],
  synergies: [
    { id: "bulwark", requires: [{ nodeId: "cleave", rank: 2 }, { nodeId: "guard" }], passives: { armor: { add: 10 } } },
  ],
};

const VEHICLE_TUNING: KinematicVehicleTuning = {
  engineAccel: 20,
  brakeAccel: 30,
  topSpeed: 30,
  reverseSpeed: 8,
  turnRate: 2,
  turnSpeedRef: 8,
  gripStrength: 8,
  handbrakeGrip: 0.25,
};

const DAMAGE_TABLE = {
  types: [
    { id: "kinetic", vs: { flesh: 0.75, shield: 1, armor: 0.5 } },
    { id: "fire", vs: { flesh: 1.5, shield: 0.75, armor: 0.75 } },
  ],
  armor: { halfValue: 100, maxMitigation: 0.9 },
};

const DAMAGE_ZONES = {
  zones: [
    { id: "body", multiplier: 1 },
    { id: "head", multiplier: 1.5, critChance: 0.25, critMultiplier: 2.5 },
  ],
  defaultZone: "body",
  critChance: 0.05,
  critMultiplier: 2,
};

const DAMAGE_STATUSES = [
  { id: "burn", stack: { kind: "stack", max: 3 }, durationMs: 3_000, intervalMs: 500, magnitude: 4, effect: { kind: "damage", channel: "fire" } },
];

interface Sim {
  save: GameSave;
  tick(): void;
  /** Continue the world clock and the scripted input cursor from a loaded save's time. */
  resume(time: number): void;
}

/**
 * Build every Lane B system over one shared injected RNG, wired into one game save. Both the
 * never-saved run and the reloaded run build from this same function and seed, so any divergence in
 * the digest is a system that does not round-trip.
 */
function createSim(seed: string, backend: SaveBackend): Sim {
  const rng = seededRng(seed);

  const needs = createNeedSet(NEEDS);
  const brain = createUtilityBrain({
    needs,
    options: [
      { id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.1, to: 0.9 } }] },
      { id: "rest", terms: [{ need: "energy", curve: { kind: "linear", from: 0.1, to: 0.9 } }] },
    ],
    interrupts: [{ need: "hunger", at: 0.05, option: "eat" }],
    jitter: 0.2,
    switchMargin: 0.1,
    rng,
  });

  const navCrowd = createNavCrowd({
    nav: createNavRuntime({ mesh: gridMesh(30, 30, 2) }),
    speed: 4,
    radius: 0.4,
    goalRadius: 0.6,
    replanMs: 1_000,
    replanBudget: 32,
  });
  navCrowd.add("walker-1", { position: [2, 0, 2], goal: [56, 0, 56] });
  navCrowd.add("walker-2", { position: [56, 0, 2], goal: [2, 0, 56] });
  navCrowd.add("walker-3", { position: [30, 0, 30], goal: [30, 0, 2] });

  const near = createNearAgents({
    nav: createNavRuntime({ mesh: gridMesh(30, 30, 2) }),
    needs: NEEDS,
    options: [{ id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.1, to: 0.9 } }] }],
    candidates: () => [{ option: "eat", cost: 1 }],
    crowd: { speed: 4, radius: 0.4, goalRadius: 0.6, replanMs: 1_000, replanBudget: 32 },
  });
  const world = createOffScreenWorld({
    places: PLACES as Record<string, readonly [number, number, number]>,
    needs: NEEDS,
    policy: { nearRadius: 10, farRadius: 14, switchBudget: 8 },
    near,
    residents: RESIDENTS,
  });

  const perception = createPerception({
    sightRange: 40,
    sightConeDeg: 180,
    hearingRange: 30,
    memorySeconds: 4,
  });

  const traffic = createTraffic({
    graph: createLaneGraph({
      lanes: [
        { id: "a", points: [[0, 0, 0], [240, 0, 0]], speed: 14, entry: true, exit: true, left: "b", parking: [90] },
        { id: "b", points: [[0, 0, 4], [240, 0, 4]], speed: 14, entry: true, exit: true, right: "a", parking: [75] },
      ],
    }),
    seed: `${seed}:traffic`,
    demand: 6,
    tuning: { fleetPerTick: 3 },
  });

  const vehicle = createKinematicVehicle(VEHICLE_TUNING);
  const vehicleDamage = createVehicleDamage({
    zones: [
      { id: "front", at: [0, 0, 2], thresholds: [20, 50, 90], deform: [0, 0, 0.2], effect: { engineScale: 0.6, drag: 0.4 } },
      { id: "rear", at: [0, 0, -2], thresholds: [30, 70], deform: [0, 0, -0.2] },
    ],
  });

  const damage = createDamageRuntime({
    table: DAMAGE_TABLE,
    zones: DAMAGE_ZONES,
    statuses: DAMAGE_STATUSES,
    rng,
  });
  damage.registerTarget("raider", { resistance: "flesh", armor: 10 });

  const loot = createLootRoller(LOOT_CATALOG);

  const skill = createSkillTree(SKILL_TREE);

  const inventory = createInventorySet(
    { bag: { slots: 6 }, stash: { slots: 6 } },
    { stackLimit: () => 20 },
  );

  const mission = createMissionRuntime({ missions: [MISSION], rng });
  mission.start(MISSION.id);

  const ledger = createTransactionLedger();
  ledger.openAccount("biz", "credits", 100_000);
  ledger.addCharge({ id: "rent", account: "biz", currency: "credits", reason: "upkeep", amountPerPeriod: 500, everySeconds: 30 });
  const market = createMarket({ goods: [{ id: "grain", basePrice: 100, stock: 40, demand: 8 }] });
  const loans = createLoanBook({ ledger });
  loans.originate({ id: "expansion", principal: 20_000, ratePerPeriod: 0.02, periods: 12, periodSeconds: 20, startSeconds: 10 });

  const police = createPoliceResponse({
    witness: perception,
    observers: () => ["cop"],
    suspectId: "suspect",
    seed: 3,
    spawnRingRadius: [30, 50],
  });

  const rides = createRideSystem({
    rides: [
      {
        id: "coaster",
        ratings: { excitement: 8, intensity: 6, nausea: 4 },
        capacity: 4,
        loadSeconds: 2,
        rideSeconds: 6,
        unloadSeconds: 2,
        breakdown: { baseChance: 0.05, wearChance: 0.02, repairSeconds: 3, repairCost: 100, serviceCost: 50 },
      },
    ],
    rng,
  });

  let now = 0;

  const save = createGameSave({
    backend,
    game: "b5.3-determinism",
    rng: { seed, stream: rng },
    clock: () => now,
    playtime: () => now,
    systems: [
      { name: "needs", snapshot: () => needs.snapshot(), restore: (next) => needs.restore(next) },
      { name: "utilityBrain", snapshot: () => brain.snapshot(), restore: (next) => brain.restore(next) },
      { name: "navCrowd", snapshot: () => navCrowd.snapshot(), restore: (next) => navCrowd.restore(next) },
      {
        name: "offScreen",
        snapshot: () => ({ world: world.snapshot(), near: near.snapshot() }),
        restore: (next) => {
          world.restore(next.world);
          near.restore(next.near);
        },
      },
      {
        name: "routine",
        snapshot: () => ({ cycleSeconds: ROUTINE.cycleSeconds, phase: ROUTINE.phaseAt(now) }),
        restore: () => {},
      },
      { name: "perception", snapshot: () => perception.snapshot(), restore: (next) => perception.restore(next) },
      { name: "traffic", snapshot: () => traffic.snapshot(), restore: (next) => traffic.restore(next) },
      {
        name: "vehicles",
        snapshot: () => ({ vehicle: vehicle.snapshot(), damage: vehicleDamage.snapshot() }),
        restore: (next) => {
          vehicle.restore(next.vehicle);
          vehicleDamage.restore(next.damage);
        },
      },
      { name: "damage", snapshot: () => damage.snapshot(), restore: (next) => damage.restore(next) },
      { name: "loot", snapshot: () => loot.snapshot(), restore: (next) => loot.restore(next) },
      { name: "progression", snapshot: () => skill.snapshot(), restore: (next) => skill.restore(next) },
      { name: "inventory", snapshot: () => inventory.snapshot(), restore: (next) => inventory.restore(next) },
      { name: "missions", snapshot: () => mission.snapshot(), restore: (next) => mission.restore(next) },
      {
        name: "economy",
        snapshot: () => ({ ledger: ledger.snapshot(), market: market.snapshot(), loans: loans.snapshot() }),
        restore: (next) => {
          ledger.restore(next.ledger);
          market.restore(next.market);
          loans.restore(next.loans);
        },
      },
      { name: "police", snapshot: () => police.state(), restore: (next) => police.restore(next) },
      { name: "rides", snapshot: () => rides.snapshot(), restore: (next) => rides.restore(next) },
    ],
  });

  let tick = 0;

  function tickOnce(): void {
    tick += 1;
    now = tick * DT;
    const t = now;
    const viewer: [number, number, number] = [16 + 14 * Math.cos(t * 0.4), 0, 12 + 14 * Math.sin(t * 0.4)];

    needs.tick(DT);
    brain.advance(DT);
    brain.decide([
      { option: "eat", cost: tick % 3 },
      { option: "rest", cost: tick % 5 },
    ]);

    navCrowd.tick(DT);
    world.tick(DT, t, viewer);

    perception.observe({ id: "cop", position: [0, 0, 0], yaw: Math.PI / 2 }, [{ id: "suspect", position: [10, 0, 0] }], t * 1_000);
    if (tick % 7 === 0) {
      perception.pushStimulus({ kind: "sound", sourceId: "suspect", position: [12, 0, 0], loudness: 1.5, at: t * 1_000 });
    }

    traffic.tick(DT);

    const axis: AxisInput = { ...NEUTRAL_AXIS, throttle: 1, steer: Math.sin(t * 0.7), brake: tick % 97 === 0 ? 1 : 0 };
    vehicle.tick(DT, axis);
    if (tick % 11 === 0) vehicleDamage.impact("front", 25);

    damage.tick(DT);
    if (tick % 5 === 0) damage.hit({ target: "raider", type: "kinetic", base: 20 });
    if (tick % 40 === 0) damage.applyStatus("raider", "burn");

    if (tick % 9 === 0) loot.roll(rng, { level: 3 });

    if (tick % 25 === 0) {
      skill.spend("cleave");
      skill.spend("guard");
    }

    if (tick % 4 === 0) inventory.put("bag", "scrap", 1);
    if (tick % 9 === 0) inventory.take("bag", "scrap", 1);
    if (tick % 20 === 0) inventory.move("bag", 0, "stash");

    mission.tick(DT, { actors: { hero: { alive: true } }, survivors: 1 });

    ledger.chargeDue(t);
    loans.advance(t);
    if (tick % 4 === 0) market.recordDemand("grain", 1, 0);
    if (tick % 6 === 0) market.sell("grain", 1);

    if (tick % 8 === 0) police.reportCrime(15);
    police.tick(DT, { nowMs: t * 1_000, activePursuers: 1, around: [10, 0] });

    if (tick % 3 === 0) rides.join("coaster", `guest-${tick}`);
    rides.tick(DT);
  }

  return {
    save,
    tick: tickOnce,
    resume(time: number) {
      tick = Math.round(time / DT);
      now = tick * DT;
    },
  };
}

describe("B5.3 — save, reload and 1,000 ticks match a run that never saved", () => {
  test("the state digest over all 16 Lane B systems matches after a save/reload", async () => {
    const backend = memorySaveBackend();

    const neverSaved = createSim(SEED, backend);
    for (let i = 0; i < TOTAL_TICKS; i += 1) neverSaved.tick();

    const saved = createSim(SEED, backend);
    for (let i = 0; i < SAVE_TICK; i += 1) saved.tick();
    await saved.save.save();

    const reloaded = createSim(SEED, backend);
    const document = await reloaded.save.load();
    reloaded.resume(document.time);
    for (let i = 0; i < EXTRA_TICKS; i += 1) reloaded.tick();

    const neverDigests = neverSaved.save.digests();
    const reloadDigests = reloaded.save.digests();
    expect(Object.keys(neverDigests).sort()).toEqual([...SYSTEM_NAMES].sort());
    expect(Object.keys(reloadDigests).sort()).toEqual([...SYSTEM_NAMES].sort());
    for (const name of SYSTEM_NAMES) {
      expect(`${name}:${reloadDigests[name]}`).toBe(`${name}:${neverDigests[name]}`);
    }
    expect(reloaded.save.digest()).toBe(neverSaved.save.digest());
  });

  test("the document carries the metadata a save menu shows and the world seed", async () => {
    const backend = memorySaveBackend();
    const sim = createSim(SEED, backend);
    for (let i = 0; i < SAVE_TICK; i += 1) sim.tick();
    const document = sim.save.capture();
    expect(document.game).toBe("b5.3-determinism");
    expect(document.version).toBe(1);
    expect(document.time).toBeCloseTo(SAVE_TICK * DT, 10);
    expect(document.playtime).toBeCloseTo(SAVE_TICK * DT, 10);
    expect(document.rng?.seed).toBe(SEED);
    expect(typeof document.rng?.cursor).toBe("number");
    expect(Object.keys(document.systems).sort()).toEqual([...SYSTEM_NAMES].sort());
  });

  test("reloading without a stored save leaves the live systems alone", async () => {
    const sim = createSim(SEED, memorySaveBackend());
    for (let i = 0; i < 30; i += 1) sim.tick();
    const before = sim.save.digest();
    await sim.save.load();
    expect(sim.save.digest()).toBe(before);
  });
});
