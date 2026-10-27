import { snippet, type SnippetFile } from "../snippets";
import type { DemoKey } from "./demoParts";
import { formatNumber, type LiveCodeSpec } from "./liveCode";
import type { TraceLines } from "./trace";

/** A live demo's jgengine code: the file it shows, which lines light while the demo does each thing, and how its sliders rewrite it. */
export interface EngineDemo {
  file: SnippetFile;
  filename: string;
  lines: TraceLines;
  live?: LiveCodeSpec;
}

const WALK_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight", "jump"] as const;
const GRASS_KNOBS = ["bladeHeight", "density", "curvature", "season", "dryness", "mixShare", "flowerShare", "windStrength", "baseColor", "tipColor"];

export const ENGINE_DEMOS: Record<DemoKey, EngineDemo> = {
  keys: {
    file: "keybinds.ts",
    filename: "src/game/input.ts",
    lines: {
      ...Object.fromEntries(WALK_ACTIONS.map((a) => [a, ["...DEFAULT_WALK_CODES"]])),
      sprint: ["sprint:"],
      interact: ["interact:", '"interact"'],
      inventory: ["inventory:", '"inventory"'],
      pause: ["pause:"],
      fire: ["fire:", '"fire"'],
    },
    live: {
      values: { fireRepeatMs: { prop: "repeatMs" } },
      swaps: [{ from: ", locked: true }, // can't be remapped", to: (d) => (d["lockFire"] ? ", locked: true }, // can't be remapped" : " },") }],
    },
  },
  projectiles: {
    file: "projectiles.ts",
    filename: "src/game/weapon.ts",
    lines: {
      fire: ["roundsPerMinute:", "weapon.setTrigger"],
      fly: ["delivery:", "weapon.tick(dt)"],
      hit: ["for (const hit of impacts)", "damage: {"],
      reload: ["magazine:"],
    },
    live: { values: { rpm: { prop: "roundsPerMinute" }, pellets: {}, speed: {}, gravity: {} } },
  },
  car: {
    file: "car.ts",
    filename: "src/game/car.ts",
    lines: {
      throttle: ["throttle: {"],
      brake: ["brake: {"],
      steer: ["steer: {"],
      handbrake: ["handbrake: {"],
      slide: ["grip:", "drift:"],
    },
    live: {
      values: { topSpeed: {}, accel: {}, turnRate: {}, grip: {}, drift: {} },
      swaps: [{ from: "VEHICLE_STYLES.drift", to: (d) => `VEHICLE_STYLES.${String(d["style"])}` }],
    },
  },
  grass: {
    file: "meadow.ts",
    filename: "src/world.ts",
    lines: { wind: ["windStrength:"] },
    live: { values: Object.fromEntries(GRASS_KNOBS.map((k) => [k, {}])) },
  },
  saves: {
    file: "save.ts",
    filename: "src/game/defineGame.ts",
    lines: { save: ["persist:"], load: ["continueGame(ctx)"] },
    live: {
      values: { autosaveSeconds: { prop: "autosaveMs", format: (v) => formatNumber(Math.round(v * 1000)) } },
      swaps: [
        { from: "version: 2 },", to: (d) => (d["cloud"] ? "version: 2, storage: createConvexSaveBackend({ client }) }," : "version: 2 },") },
        { from: "saves to localStorage", to: (d) => (d["cloud"] ? "saves to your Convex backend" : "saves to localStorage") },
      ],
    },
  },
  minimap: {
    file: "adopt-minimap.tsx",
    filename: "src/ui/Minimap.tsx",
    lines: { markers: ["const markers = units.map"], center: ["<Minimap markers="] },
    live: {
      swaps: [{ from: "worldRadius={60} />", to: (d) => `worldRadius={${Number(d["worldRadius"] ?? 60)}}${d["rotate"] ? " rotate" : ""} />` }],
    },
  },
  health: {
    file: "adopt-health.ts",
    filename: "src/health.ts",
    lines: {
      hit: ["export const onHit"],
      potion: ["export const onPotion"],
      get: ["get: (id"],
      set: ["set: (id", "pools[id]![stat] = next"],
    },
    live: {
      swaps: [
        { from: "current: 100, max: 100", to: (d) => `current: ${Number(d["maxHealth"] ?? 100)}, max: ${Number(d["maxHealth"] ?? 100)}` },
        { from: '"health", -12)', to: (d) => `"health", -${Number(d["hitSize"] ?? 12)})` },
        { from: '"health", 20)', to: (d) => `"health", ${Number(d["potionSize"] ?? 20)})` },
      ],
    },
  },
  damage: {
    file: "adopt-damage.ts",
    filename: "src/damage.ts",
    lines: {
      shot: ["resolveDamageHit({", "impact: 24", "channel:"],
      armored: ["targetTraits:", "matchup:"],
      drain: ["applyStatPoolDelta(access, enemy.id"],
    },
    live: {
      swaps: [
        { from: "impact: 24,", to: (d) => `impact: ${Number(d["impact"] ?? 24)},` },
        { from: "armored: { impact: 0.5 }", to: (d) => `armored: { impact: ${Number(d["armorFactor"] ?? 0.5)} }` },
      ],
    },
  },
  xp: {
    file: "adopt-xp.ts",
    filename: "src/xp.ts",
    lines: { kill: ["export const onKill"], levelup: ["export const onKill"], curve: ["xpForLevel:"] },
    live: {
      values: { base: {}, exponent: {}, maxLevel: {} },
      swaps: [{ from: '"p1", 60,', to: (d) => `"p1", ${Number(d["xpPerKill"] ?? 60)},` }],
    },
  },
  catenary: {
    file: "cable.ts",
    filename: "src/festoon.ts",
    lines: {},
    live: { values: { slack: {} } },
  },
  terrain: {
    file: "hills.ts",
    filename: "src/terrain.ts",
    lines: {},
    live: {
      values: { seed: {}, frequency: {}, octaves: {} },
      swaps: [{ from: "ridged: false", to: (d) => `ridged: ${d["ridged"] === true}` }],
    },
  },
};

export function engineDemoCode(key: DemoKey): string {
  return snippet(ENGINE_DEMOS[key].file);
}
