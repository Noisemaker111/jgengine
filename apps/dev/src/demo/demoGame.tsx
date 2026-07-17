import { defineGame } from "@jgengine/core/game/defineGame";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import type {
  GameContext,
  GameContextEntityEntry,
  GameContextItemEntry,
} from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { CurrencyPill, SlotGrid, StatMeter } from "@jgengine/react/components";
import { useFeed, useGameClock, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";

import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const MOB = "gloomSlime";
const LOOT_TABLE = "slime-drops";
const GOLD = "gold";
const HOTBAR = "hotbar";
const MELEE_DAMAGE = 6;
const MELEE_RANGE = 1.9;
const MELEE_COOLDOWN = 1.2;
const AGGRO_RADIUS = 11;
const MOB_SPAWNS: readonly (readonly [number, number, number])[] = [
  [7, 0, -6],
  [-8, 0, 5],
  [6, 0, 8],
];

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: {
    stats: { health: { max: 100 }, mana: { max: 60 } },
    receive: { damage: { order: ["health"] } },
    movement: { poses: ["standing", "running", "crouch"], walkSpeed: 2.4 },
  },
  [MOB]: {
    stats: { health: { max: 60 } },
    receive: { damage: { order: ["health"] } },
    onDeath: { drops: LOOT_TABLE },
    role: "enemy",
  },
};

const itemCatalog: Record<string, GameContextItemEntry> = {
  sword: { use: "swingSword", weapon: { damage: 22 } },
  zap: { use: "castZap", weapon: { damage: 35, manaCost: 12, range: 18 } },
};

const game = defineGame({
  name: "gameplayer-demo",
  assets: createAssetCatalog(),
  multiplayer: null,
  features: { social: true, chat: true },
  inventories: { [HOTBAR]: { slots: 4, hud: "hotbar" } },
  time: { start: 8 * 3600, speeds: [1, 2, 3, 4] },
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    sprint: ["Shift"],
    turnLeft: ["KeyQ"],
    turnRight: ["KeyE"],
    tabTarget: ["Tab"],
    clearTarget: ["Escape"],
    slot1: ["Digit1"],
    slot2: ["Digit2"],
  },
});

let elapsed = 0;
let nextSpawnIndex = 0;
const meleeReadyAt = new Map<string, number>();

function spawnMob(ctx: GameContext): void {
  const at = MOB_SPAWNS[nextSpawnIndex % MOB_SPAWNS.length]!;
  nextSpawnIndex += 1;
  ctx.scene.entity.spawn(MOB, { position: at, role: "npc" });
}

function spawnHero(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, {
    id: ctx.player.userId,
    position: [0, 0, 0],
    role: "player",
  });
}

function onInit(ctx: GameContext): void {
  elapsed = 0;
  nextSpawnIndex = 0;
  meleeReadyAt.clear();
  ctx.game.loot.register({ id: LOOT_TABLE, entries: [{ currency: GOLD, count: [2, 5], weight: 1 }] });
  ctx.game.feed.bind("entity.died");
  ctx.game.events.on("entity.died", (event) => {
    if (event.catalogId === MOB) {
      meleeReadyAt.delete(event.instanceId);
      spawnMob(ctx);
    }
  });
  ctx.item.use.register({
    swingSword: {
      apply(state, input) {
        const hits = state.scene.entity
          .queryArc({ from: input.from, aim: input.aim ?? { yaw: 0, pitch: 0 }, radius: 3.2, halfAngleDeg: 70 })
          .filter((id) => state.scene.entity.get(id)?.name === MOB);
        for (const id of hits) {
          state.scene.entity.effect({ from: input.from, to: id, effect: "damage", via: { item: input.itemId } });
        }
        return { state };
      },
    },
    castZap: {
      can(state, input) {
        const targetId = state.scene.entity.getTarget(input.from);
        if (targetId === null) return { reason: "no-target" };
        const range = state.item.weapon.getStat(input.itemId, "range") ?? Number.POSITIVE_INFINITY;
        const distance = state.scene.entity.distance(input.from, targetId);
        if (distance === null || distance > range) return { reason: "out-of-range" };
        const cost = state.item.weapon.getStat(input.itemId, "manaCost") ?? 0;
        const mana = state.scene.entity.stats.get(input.from, "mana");
        if (mana === null || mana.current < cost) return { reason: "no-mana" };
        return null;
      },
      apply(state, input) {
        const targetId = state.scene.entity.getTarget(input.from);
        if (targetId === null) return { state, error: "no-target" };
        const cost = state.item.weapon.getStat(input.itemId, "manaCost") ?? 0;
        state.scene.entity.stats.delta(input.from, "mana", -cost);
        state.scene.entity.effect({ from: input.from, to: targetId, effect: "damage", via: { item: input.itemId } });
        return { state };
      },
    },
  });
}

function onNewPlayer(ctx: GameContext): void {
  spawnHero(ctx);
  ctx.player.inventory.put(HOTBAR, "sword", 1);
  ctx.player.inventory.put(HOTBAR, "zap", 1);
  ctx.game.economy.grant(ctx.player.userId, GOLD, 10);
  for (let index = 0; index < MOB_SPAWNS.length; index += 1) spawnMob(ctx);
}

function onTick(ctx: GameContext, dt: number): void {
  elapsed += dt;
  const playerId = ctx.player.userId;
  const player = ctx.scene.entity.get(playerId);
  if (player === null) {
    spawnHero(ctx);
    return;
  }
  const mana = ctx.scene.entity.stats.get(playerId, "mana");
  if (mana !== null && mana.current < mana.max) ctx.scene.entity.stats.delta(playerId, "mana", 5 * dt);
  for (const mob of ctx.scene.entity.list()) {
    if (mob.name !== MOB) continue;
    const distance = ctx.scene.entity.distance(mob.id, playerId);
    if (distance === null || distance > AGGRO_RADIUS) continue;
    if (distance > MELEE_RANGE) {
      const next = ctx.scene.entity.moveToward(mob.id, playerId, {
        speed: 2,
        stopDistance: MELEE_RANGE * 0.8,
        dt,
      });
      if (next !== null) {
        ctx.scene.entity.setPose(mob.id, {
          position: next,
          rotationY: Math.atan2(player.position[0] - next[0], player.position[2] - next[2]),
        });
      }
    } else if ((meleeReadyAt.get(mob.id) ?? 0) <= elapsed) {
      meleeReadyAt.set(mob.id, elapsed + MELEE_COOLDOWN);
      ctx.scene.entity.effect({ from: mob.id, to: playerId, effect: "damage", via: { amount: MELEE_DAMAGE } });
    }
  }
}

function VitalsPanel({ userId }: { userId: string }) {
  return (
    <div className="rounded bg-black/60 p-2">
      <StatMeter
        instanceId={userId}
        statId="health"
        className="h-2.5 overflow-hidden rounded bg-white/15"
        fillClassName="bg-emerald-400"
      />
      <StatMeter
        instanceId={userId}
        statId="mana"
        className="mt-1 h-1.5 overflow-hidden rounded bg-white/15"
        fillClassName="bg-sky-400"
      />
    </div>
  );
}

function TargetPanel({ userId }: { userId: string }) {
  const targetId = useTarget(userId);
  const targetName = useGameStore((ctx) =>
    targetId === null ? null : (ctx.scene.entity.get(targetId)?.name ?? null),
  );
  if (targetId === null || targetName === null) {
    return <p className="rounded bg-black/50 px-2 py-1 text-center text-xs text-white/50">Tab: target a mob</p>;
  }
  return (
    <div className="rounded bg-black/60 p-2">
      <p className="text-xs uppercase tracking-wide text-red-300">{targetName}</p>
      <StatMeter
        instanceId={targetId}
        statId="health"
        className="mt-1 h-2 overflow-hidden rounded bg-white/15"
        fillClassName="bg-red-400"
      />
    </div>
  );
}

function KillFeedPanel() {
  const kills = useFeed({ action: "entity.died", limit: 5 });
  return (
    <ul className="space-y-0.5 text-right text-xs text-white/70">
      {kills
        .slice()
        .reverse()
        .map((entry, index) => (
          <li key={`${entry.at}-${index}`}>{(entry.data as Partial<EntityDiedEvent>).catalogId ?? "?"} down</li>
        ))}
    </ul>
  );
}

function HotbarPanel() {
  return (
    <SlotGrid
      inventoryId={HOTBAR}
      className="flex gap-1.5"
      renderSlot={(slot, index) => (
        <div className="w-16 rounded border border-white/20 bg-black/60 px-1.5 py-1 text-center text-[11px]">
          <span className="text-white/50">{index + 1}</span>
          <p className="truncate text-white">{slot === null ? "—" : slot.itemId}</p>
        </div>
      )}
    />
  );
}

function ClockPanel() {
  const { paused, playSpeed, speeds, calendar, controls } = useGameClock();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-xs">
      <span className="tabular-nums text-white">
        Day {calendar.day + 1} · {pad(calendar.hour)}:{pad(calendar.minute)}
      </span>
      <button
        onClick={() => controls.toggle()}
        className="rounded border border-white/25 px-1.5 py-0.5 text-white/80 hover:bg-white/10"
      >
        {paused ? "▶" : "⏸"}
      </button>
      <div className="flex gap-0.5">
        {speeds.map((speed) => (
          <button
            key={speed}
            onClick={() => controls.setSpeed(speed)}
            className={`rounded border px-1.5 py-0.5 ${
              !paused && speed === playSpeed
                ? "border-amber-300 bg-amber-300/20 text-amber-200"
                : "border-white/25 text-white/70 hover:bg-white/10"
            }`}
          >
            {speed}×
          </button>
        ))}
      </div>
    </div>
  );
}

function DemoGameUI() {
  const player = usePlayer();
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white">
      <div className="absolute left-4 top-4">
        <ClockPanel />
      </div>
      <div className="absolute left-1/2 top-4 w-56 -translate-x-1/2">
        <TargetPanel userId={player.userId} />
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <CurrencyPill currencyId={GOLD} className="rounded bg-black/60 px-2 py-1 text-sm text-amber-300" />
        <KillFeedPanel />
      </div>
      <div className="absolute bottom-4 left-4 w-64">
        <VitalsPanel userId={player.userId} />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <HotbarPanel />
      </div>
      <div className="absolute bottom-4 right-4 max-w-[220px] text-right text-[11px] leading-4 text-white/40">
        WASD move · Space jump · Shift sprint · Q/E turn · Tab target · Esc clear · 1 sword · 2 zap
      </div>
    </div>
  );
}

export const demoGame: PlayableGame = {
  game,
  content: {
    itemById: (itemId) => itemCatalog[itemId] ?? null,
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick, onReset: () => {}, onDispose: () => {} },
  GameUI: DemoGameUI,
};
