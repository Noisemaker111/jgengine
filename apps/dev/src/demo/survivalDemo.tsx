import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import {
  createDecayMeterSet,
  type DecayMeterSet,
} from "@jgengine/core/survival/decayMeter";
import {
  createMoodleStack,
  stackMoodles,
  type Moodle,
  type MoodleStack,
} from "@jgengine/core/survival/moodle";
import {
  createMultiRegionHealth,
  type MultiRegionHealth,
} from "@jgengine/core/survival/regionHealth";
import { environment, rain, terrain } from "@jgengine/core/world/features";
import {
  createEnvironmentField,
  type EnvironmentField,
  type HeatSource,
} from "@jgengine/core/world/envField";
import { resolveTerrainField } from "@jgengine/core/world/terrain";
import {
  createFireGrid,
  resolveWeather,
  type FireGrid,
  type WeatherModifierTable,
  type WeatherState,
} from "@jgengine/core/world/weather";
import { useEngineState, type ReadableEngineStore } from "@jgengine/react/engineStore";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { FireSpreadLayer } from "@jgengine/shell/weather/FireSpreadLayer";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "survivor";
const HOTBAR = "hotbar";
const DAY_LENGTH = 24 * 3600;
const FIRE_ORIGIN: readonly [number, number] = [-16, -16];
const FIRE_CELL = 2;
const CAMPFIRE: HeatSource = { x: 8, z: 0, radius: 9, strength: 26 };

const weatherTable: WeatherModifierTable = {
  clear: {},
  rain: { grip: 0.65, visibility: 0.7, spread: 0.35, chill: -4 },
  storm: { grip: 0.45, visibility: 0.4, structureDamage: 4, ignition: 0.15, spread: 0.25, chill: -8 },
};

interface SurvivalSnapshot {
  version: number;
  meters: ReturnType<DecayMeterSet["snapshot"]>;
  moodles: readonly Moodle[];
  regions: ReturnType<MultiRegionHealth["regions"]>;
  overall: number;
  temperature: number;
  wetness: number;
  weather: WeatherState;
  visibility: number;
  grip: number;
  burning: number;
}

interface SurvivalSim {
  store: ReadableEngineStore<SurvivalSnapshot>;
  fire: FireGrid;
  field: EnvironmentField;
  tick(ctx: GameContext, dt: number, gameTime: number): void;
  treat(itemId: string): void;
  bootstrap(): void;
}

function createSurvivalSim(): SurvivalSim {
  const meters = createDecayMeterSet([
    {
      id: "hunger",
      max: 100,
      rate: 0.9,
      thresholds: [
        { id: "peckish", label: "Peckish", at: 55, when: "below", severity: "neutral" },
        { id: "hungry", label: "Hungry", at: 30, when: "below", severity: "warning" },
        { id: "starving", label: "Starving", at: 12, when: "below", severity: "critical" },
      ],
    },
    {
      id: "thirst",
      max: 100,
      rate: 1.3,
      thresholds: [
        { id: "thirsty", label: "Thirsty", at: 35, when: "below", severity: "warning" },
        { id: "dehydrated", label: "Dehydrated", at: 12, when: "below", severity: "critical" },
      ],
    },
    {
      id: "warmth",
      max: 100,
      start: 72,
      rate: 0.6,
      thresholds: [
        { id: "chilly", label: "Chilly", at: 45, when: "below", severity: "neutral" },
        { id: "freezing", label: "Freezing", at: 20, when: "below", severity: "critical" },
      ],
    },
    {
      id: "stamina",
      max: 100,
      rate: 0,
      thresholds: [{ id: "winded", label: "Winded", at: 20, when: "below", severity: "warning" }],
    },
  ]);

  const health = createMultiRegionHealth({
    regions: [
      { id: "head", label: "Head", max: 35, vital: true, vulnerability: 2 },
      { id: "torso", label: "Torso", max: 85, vital: true },
      { id: "leftArm", label: "L. Arm", max: 55 },
      { id: "rightArm", label: "R. Arm", max: 55 },
      { id: "legs", label: "Legs", max: 70 },
    ],
    ailments: {
      bleed: {
        id: "bleed",
        label: "Bleeding",
        region: "torso",
        severity: "critical",
        drainPerSecond: 1.4,
        stacking: true,
        treatedBy: ["bandage"],
      },
      fracture: {
        id: "fracture",
        label: "Fractured Leg",
        region: "legs",
        severity: "warning",
        treatedBy: ["splint"],
      },
    },
  });

  const buffs: MoodleStack = createMoodleStack();
  const fire = createFireGrid({
    cols: 16,
    rows: 16,
    cellSize: FIRE_CELL,
    origin: FIRE_ORIGIN,
    spreadRate: 0.9,
    burnRate: 0.05,
    wind: [1, 0.35],
    windBias: 0.7,
  });

  let weather: WeatherState = { kind: "rain", intensity: 0.55, wind: [1, 0.35] };
  const field = createEnvironmentField({
    dayLength: DAY_LENGTH,
    baseTemperature: 14,
    nightDrop: 14,
    heatSources: [CAMPFIRE],
    rain: () => (weather.kind === "clear" ? 0 : weather.intensity),
    occluders: [{ x: 20, z: 18, w: 10, d: 10, shade: 1 }],
  });

  let version = 0;
  let currentTime = 0;
  const listeners = new Set<(state: SurvivalSnapshot) => void>();

  function computeSnapshot(): SurvivalSnapshot {
    const resolved = resolveWeather(weather, weatherTable);
    const temperature = field.temperature(0, 0, currentTime, 0);
    return {
      version,
      meters: meters.snapshot(),
      moodles: stackMoodles(buffs.list(), meters.moodles(), health.ailmentMoodles()),
      regions: health.regions(),
      overall: health.overall(),
      temperature,
      wetness: field.wetness(0, 0, currentTime),
      weather,
      visibility: resolved.visibility,
      grip: resolved.grip,
      burning: fire.burning,
    };
  }

  let snapshot = computeSnapshot();

  function notify(): void {
    version += 1;
    snapshot = computeSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  return {
    store: {
      getState: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    fire,
    field,
    bootstrap() {
      health.damage("head", 9);
      health.damage("legs", 26);
      health.applyAilment("bleed");
      health.applyAilment("bleed");
      health.applyAilment("fracture");
      buffs.add({ id: "cookedMeat", label: "Cooked Meat", duration: 320, severity: "good", note: "+HP regen" });
      buffs.add({ id: "berries", label: "Berries", duration: 180, severity: "good" });
      meters.refill("hunger", -58);
      meters.refill("thirst", -66);
      meters.refill("warmth", -34);
      meters.refill("stamina", -70);
      fire.ignite(-4, 4);
      fire.ignite(-2, 4);
      fire.ignite(-4, 6);
      fire.ignite(0, 6);
      notify();
    },
    tick(_ctx, dt, gameTime) {
      currentTime = gameTime;
      const sample = field.sample(0, 0, gameTime, 0);
      const coldPenalty = sample.temperature < 8 ? 2.4 : sample.temperature < 16 ? 1.4 : 0.6;
      meters.setRateModifier("warmth", coldPenalty);
      meters.tick(dt);
      buffs.tick(dt);
      health.tick(dt);
      const resolved = resolveWeather(weather, weatherTable);
      const wetnessAt = (col: number, row: number): number =>
        field.wetness(FIRE_ORIGIN[0] + col * FIRE_CELL, FIRE_ORIGIN[1] + row * FIRE_CELL, gameTime);
      fire.step(dt, { spread: resolved.spread, wetnessAt });
      notify();
    },
    treat(itemId) {
      health.treat(itemId);
      notify();
    },
  };
}

let sim: SurvivalSim = createSurvivalSim();

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: {
    stats: { health: { max: 100 }, stamina: { max: 100 } },
    receive: { damage: { order: ["health"] } },
    movement: { poses: ["standing", "running", "crouch"], walkSpeed: 2.4 },
  },
};

const game = defineGame({
  name: "survival-demo",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: { [HOTBAR]: { slots: 4, hud: "hotbar" } },
  time: { start: 6 * 3600, dayLength: DAY_LENGTH, speeds: [1, 2, 3, 4] },
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    sprint: ["Shift"],
    slot1: ["Digit1"],
    slot2: ["Digit2"],
  },
});

function onInit(ctx: GameContext): void {
  sim = createSurvivalSim();
  sim.bootstrap();
  ctx.item.use.register({
    treatWound: {
      apply(state, input) {
        sim.treat(input.itemId);
        return { state };
      },
    },
  });
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  ctx.player.inventory.put(HOTBAR, "bandage", 3);
  ctx.player.inventory.put(HOTBAR, "splint", 1);
}

function onTick(ctx: GameContext, dt: number): void {
  sim.tick(ctx, dt, ctx.time.now());
}

const survivalWorld = environment({
  terrain: terrain({ bounds: { w: 160, d: 160 }, height: 3, frequency: 0.03, seed: "survival" }),
  weather: rain({ area: { w: 160, d: 120, h: 60 }, density: 0.5, wind: [1.2, 0.3] }),
});
const survivalField = resolveTerrainField(survivalWorld.terrain);

function SurvivalWorld() {
  return (
    <>
      <EnvironmentScene feature={survivalWorld} />
      <FireSpreadLayer grid={sim.fire} cellSize={FIRE_CELL} origin={FIRE_ORIGIN} heightAt={survivalField.sampleHeight} />
    </>
  );
}

const SEVERITY_STYLE: Record<Moodle["severity"], string> = {
  good: "border-emerald-400/70 bg-emerald-500/15 text-emerald-200",
  neutral: "border-sky-400/60 bg-sky-500/10 text-sky-200",
  warning: "border-amber-400/70 bg-amber-500/15 text-amber-200",
  critical: "border-rose-500/80 bg-rose-600/20 text-rose-200",
};

function MoodleChip({ moodle }: { moodle: Moodle }) {
  return (
    <div className={`flex min-w-[86px] items-center gap-2 rounded-md border px-2 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm ${SEVERITY_STYLE[moodle.severity]}`}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded bg-black/40 text-base font-bold">
        {moodle.icon ?? moodle.label.slice(0, 1)}
        {moodle.stacks > 1 ? (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-black/80 px-1 text-[10px] font-bold text-white">
            {moodle.stacks}
          </span>
        ) : null}
      </div>
      <div className="leading-tight">
        <p className="text-xs font-semibold">{moodle.label}</p>
        {moodle.note !== undefined ? <p className="text-[10px] opacity-80">{moodle.note}</p> : null}
        {moodle.fraction !== undefined ? (
          <div className="mt-1 h-1 w-16 overflow-hidden rounded bg-black/50">
            <div className="h-full bg-current" style={{ width: `${Math.round(moodle.fraction * 100)}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MoodleStackPanel() {
  const state = useEngineState(sim.store);
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1.5">
      {state.moodles.map((moodle) => (
        <MoodleChip key={moodle.id} moodle={moodle} />
      ))}
    </div>
  );
}

const METER_STYLE: Record<string, { label: string; fill: string }> = {
  hunger: { label: "Hunger", fill: "bg-orange-400" },
  thirst: { label: "Thirst", fill: "bg-sky-400" },
  warmth: { label: "Warmth", fill: "bg-rose-400" },
  stamina: { label: "Stamina", fill: "bg-lime-400" },
};

function MetersPanel() {
  const state = useEngineState(sim.store);
  return (
    <div className="w-60 rounded-lg border border-white/15 bg-black/70 p-3 shadow-xl shadow-black/50">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/60">Condition</p>
      <div className="space-y-2">
        {Object.entries(METER_STYLE).map(([id, style]) => {
          const meter = state.meters[id];
          if (meter === undefined) return null;
          return (
            <div key={id}>
              <div className="mb-0.5 flex justify-between text-[11px] text-white/70">
                <span>{style.label}</span>
                <span className="tabular-nums">{Math.round(meter.value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded bg-white/10">
                <div className={`h-full rounded ${style.fill}`} style={{ width: `${Math.round(meter.fraction * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegionHealthPanel() {
  const state = useEngineState(sim.store);
  const barColor = (fraction: number): string =>
    fraction > 0.6 ? "bg-emerald-400" : fraction > 0.3 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="w-56 rounded-lg border border-white/15 bg-black/70 p-3 shadow-xl shadow-black/50">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Body</p>
        <span className="text-[11px] tabular-nums text-white/70">{Math.round(state.overall * 100)}%</span>
      </div>
      <div className="space-y-1.5">
        {state.regions.map((region) => (
          <div key={region.id} className="flex items-center gap-2">
            <span className={`w-14 shrink-0 text-[11px] ${region.vital ? "text-white" : "text-white/70"}`}>
              {region.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-white/10">
              <div className={`h-full rounded ${barColor(region.fraction)}`} style={{ width: `${Math.round(region.fraction * 100)}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/60">
              {Math.round(region.current)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnvironmentReadout() {
  const state = useEngineState(sim.store);
  return (
    <div className="rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-right shadow-xl shadow-black/50">
      <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Weather</p>
      <p className="mt-1 text-sm font-semibold capitalize text-sky-200">
        {state.weather.kind} · {Math.round(state.weather.intensity * 100)}%
      </p>
      <div className="mt-1 space-y-0.5 text-[11px] tabular-nums text-white/70">
        <p>Temp {state.temperature.toFixed(1)}°</p>
        <p>Wet {Math.round(state.wetness * 100)}%</p>
        <p>Grip {Math.round(state.grip * 100)}% · Vis {Math.round(state.visibility * 100)}%</p>
        {state.burning > 0 ? <p className="text-orange-300">{state.burning} cells ablaze</p> : null}
      </div>
    </div>
  );
}

function SurvivalGameUI() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4">
        <MoodleStackPanel />
      </div>
      <div className="absolute right-4 top-4">
        <EnvironmentReadout />
      </div>
      <div className="absolute bottom-4 left-4">
        <MetersPanel />
      </div>
      <div className="absolute bottom-4 right-4">
        <RegionHealthPanel />
      </div>
    </div>
  );
}

const itemCatalog = {
  bandage: { use: "treatWound" },
  splint: { use: "treatWound" },
} as const;

export const survivalDemoGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    itemById: (itemId) => (itemId in itemCatalog ? itemCatalog[itemId as keyof typeof itemCatalog] : null),
  },
  loop: { onInit, onNewPlayer, onTick, onReset: () => {}, onDispose: () => {} },
  GameUI: SurvivalGameUI,
  environment: SurvivalWorld,
  camera: { minDistance: 8, maxDistance: 40, initialDistance: 26, targetHeight: 1.4 },
};
