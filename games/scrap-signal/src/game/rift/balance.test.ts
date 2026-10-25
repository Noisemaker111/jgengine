import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { seededRng } from "@jgengine/core/random/rng";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { pickCharacter, resetCharacterState } from "../characters";
import { resolveGunHit, syncCombatTargets, tickCombat } from "../combat/hitModel";
import { content } from "../content";
import { frontUnitIds, FRONT_SITE, tickFront } from "../encounters/front";
import {
  applyElementalProc,
  enterDowned,
  powerSurge,
  reservePhase,
  rollGun,
  tickDots,
  tickDowned,
  tickShields,
  type GunDef,
  type GunFamily,
  type Rarity,
} from "../handroll";
import { registerRift, riftShieldRegen, riftStore, startRift, tickRift } from "./rift";
import { RIFT_TIER_COUNT, riftEventId } from "./tiers";

afterEach(resetCharacterState);

/**
 * The balance bot: a reclaimer who stands at the wreck and shoots the nearest crew member with a
 * real rolled gun through the game's own damage model, while the real front drives the crews and the
 * real Overdrive run scales them. It cannot strafe, take cover or throw grenades, so its results are a
 * floor: a tier the bot clears is one a player at that gear clears too.
 */
interface Kit {
  level: number;
  rarity: Rarity;
  family: GunFamily;
  /** Gun level above the reclaimer's own. */
  gunLevelBonus?: number;
  /** Share of pellets that land. */
  accuracy?: number;
  /** Extra shield from black-market upgrades. */
  shieldBonus?: number;
}

interface RunResult {
  cleared: boolean;
  seconds: number;
  wave: number;
  reason: string;
  medal: string | null;
}

const STEP = 1 / 20;
const LIMIT_SECONDS = 900;

function boot(kit: Kit, tier: number): { ctx: GameContext; gun: GunDef } {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "overdrive-balance", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "reclaimer", isNew: true },
  });
  pickCharacter("gunk");
  const x = FRONT_SITE.x - 9;
  const z = FRONT_SITE.z - 9;
  ctx.scene.entity.spawn("reactor_hunter", { id: "reclaimer", position: [x, 0, z], role: "player" });
  const health = 90 + 8 * (kit.level - 1);
  ctx.scene.entity.stats.set("reclaimer", "level", { current: kit.level });
  ctx.scene.entity.stats.set("reclaimer", "health", { max: health, current: health });
  const shield = 60 + (kit.shieldBonus ?? 0);
  ctx.scene.entity.stats.set("reclaimer", "shield", { max: shield, current: shield });
  registerRift(ctx);
  syncCombatTargets(ctx);
  setGamePhase(ctx, "playing");
  const best: Record<string, number> = {};
  for (let open = 1; open < tier; open += 1) best[riftEventId(open)] = 600;
  riftStore.write(ctx, { ...riftStore.read(ctx), unlocked: true, board: { best } });
  const gun = rollGun(seededRng(`bot:${kit.family}:${kit.rarity}:${kit.level}`), kit.level + (kit.gunLevelBonus ?? 0), {
    rarity: kit.rarity,
    family: kit.family,
  });
  return { ctx, gun };
}

function runTier(tier: number, kit: Kit, seed = 0): RunResult {
  const { ctx, gun } = boot(kit, tier);
  const started = startRift(ctx, tier);
  if (!started.ok) throw new Error(started.reason);
  const rng = seededRng(`bot-aim:${tier}:${seed}`);
  const accuracy = kit.accuracy ?? 0.55;
  const player = "reclaimer";
  let cooldown = 0;
  let loaded = gun.magSize;
  let reloading = 0;
  let elapsed = 0;
  while (elapsed < LIMIT_SECONDS) {
    ctx.time.advance(STEP);
    elapsed += STEP;
    const nowMs = ctx.time.now() * 1000;
    tickFront(ctx, STEP);
    tickRift(ctx, STEP);
    tickShields(ctx, nowMs, STEP, riftShieldRegen(ctx));
    tickDots(ctx, STEP);
    tickCombat(ctx, STEP);

    const health = ctx.scene.entity.stats.get(player, "health");
    if (reservePhase(ctx) === "alive" && health !== null && health.current <= (health.min ?? 1)) enterDowned(ctx);
    for (const event of tickDowned(ctx, STEP)) {
      if (event.kind === "died") return finishReport(ctx, false, elapsed, "bled out");
    }

    const run = riftStore.read(ctx).run;
    if (run === null) return finishReport(ctx, false, elapsed, "no run");
    if (run.phase === "won") return finishReport(ctx, true, elapsed, "");
    if (run.phase === "lost") return finishReport(ctx, false, elapsed, run.reason ?? "lost");

    cooldown -= STEP;
    if (reloading > 0) {
      reloading -= STEP;
      if (reloading <= 0) loaded = gun.magSize;
      continue;
    }
    if (cooldown > 0) continue;
    const self = ctx.scene.entity.get(player);
    if (self === null) continue;
    let target: string | null = null;
    let nearest = gun.weapon.range;
    for (const id of frontUnitIds(ctx)) {
      const entity = ctx.scene.entity.get(id);
      if (entity === null) continue;
      const distance = Math.hypot(entity.position[0] - self.position[0], entity.position[2] - self.position[2]);
      if (distance < nearest) {
        nearest = distance;
        target = id;
      }
    }
    if (target === null) continue;
    cooldown = gun.weapon.fireIntervalMs / 1000;
    loaded -= gun.ammoPerShot;
    if (loaded <= 0) reloading = gun.reloadMs / 1000;
    const pellets = gun.weapon.pellets ?? 1;
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      if (rng() >= accuracy) continue;
      if (ctx.scene.entity.get(target) === null) break;
      const before = frontUnitIds(ctx).length;
      resolveGunHit(ctx, gun, player, target, gun.elementChance);
      if (ctx.scene.entity.get(target) !== null) applyElementalProc(ctx, rng, gun, player, target);
      if (reservePhase(ctx) === "downed" && frontUnitIds(ctx).length < before) powerSurge(ctx);
    }
  }
  return finishReport(ctx, false, elapsed, "out of time");
}

function finishReport(ctx: GameContext, cleared: boolean, seconds: number, reason: string): RunResult {
  const run = riftStore.read(ctx).run;
  return { cleared, seconds: Math.round(seconds), wave: run?.wave ?? 0, reason, medal: run?.medal ?? null };
}

interface Cell {
  clears: number;
  golds: number;
  /** Median seconds over the runs that cleared, or null when none did. */
  median: number | null;
}

const SEEDS = 5;

function cell(tier: number, kit: Kit): Cell {
  const runs = Array.from({ length: SEEDS }, (_, seed) => runTier(tier, kit, seed));
  const cleared = runs.filter((run) => run.cleared).map((run) => run.seconds).sort((a, b) => a - b);
  return {
    clears: cleared.length,
    golds: runs.filter((run) => run.medal === "gold").length,
    median: cleared.length === 0 ? null : cleared[Math.floor(cleared.length / 2)]!,
  };
}

const KITS = {
  green: { level: 12, rarity: "uncommon", family: "rifle" },
  blue: { level: 12, rarity: "rare", family: "rifle", gunLevelBonus: 1 },
  purple: { level: 12, rarity: "epic", family: "rifle", gunLevelBonus: 2, shieldBonus: 25 },
  legendary: { level: 12, rarity: "legendary", family: "rifle", gunLevelBonus: 3, accuracy: 0.7, shieldBonus: 50 },
} satisfies Record<string, Kit>;

const TIERS = [1, 3, 5, 8, 10, 13, 15, 20] as const;

describe("Overdrive pacing, played by the balance bot", () => {
  const table = new Map<string, Cell>();
  const at = (kit: keyof typeof KITS, tier: number): Cell => {
    const key = `${kit}:${tier}`;
    if (!table.has(key)) table.set(key, cell(tier, KITS[kit]));
    return table.get(key)!;
  };

  test("plays the ladder", () => {
    const rows = [`${"level 12".padEnd(10)}${TIERS.map((tier) => `T${tier}`.padStart(12)).join("")}`];
    for (const kit of Object.keys(KITS) as (keyof typeof KITS)[]) {
      const cells = TIERS.map((tier) => at(kit, tier));
      rows.push(kit.padEnd(10) + cells.map((c) => `${c.clears}/${SEEDS} ${c.median === null ? "  -" : String(c.median).padStart(3)}s`.padStart(12)).join(""));
    }
    if (process.env.BOT_TABLE) console.log(rows.join(String.fromCharCode(10)));
    expect(table.size).toBe(TIERS.length * Object.keys(KITS).length);
  }, 300_000);

  test("the first tier is the plain front at your level: clearable with what you found", () => {
    expect(at("green", 1).clears).toBeGreaterThanOrEqual(3);
    expect(at("legendary", 1).clears).toBe(SEEDS);
  });

  test("gold is not automatic: at-level greens clear without it, a legendary earns it", () => {
    expect(at("green", 1).golds).toBe(0);
    expect(at("legendary", 1).golds).toBeGreaterThanOrEqual(4);
  });

  // The bot stands still and its crit rolls share the game's live random stream, so these hold the
  // ladder's shape with room for a run going either way, not exact counts.
  test("gear is the key to the middle of the ladder", () => {
    expect(at("green", 8).clears).toBe(0);
    expect(at("legendary", 8).clears).toBeGreaterThanOrEqual(3);
    expect(at("legendary", 8).clears).toBeGreaterThanOrEqual(at("purple", 8).clears);
    expect(at("purple", 5).clears + at("blue", 5).clears).toBeGreaterThan(at("green", 5).clears);
  });

  test("the back half of the ladder holds against the best kit", () => {
    const clears = (tiers: readonly number[]) => tiers.reduce((sum, tier) => sum + at("legendary", tier).clears, 0);
    expect(clears([13, 15, 20])).toBeLessThan(clears([1, 3, 5]) / 2);
    expect(at("legendary", 20).clears).toBeLessThanOrEqual(1);
  });
});
