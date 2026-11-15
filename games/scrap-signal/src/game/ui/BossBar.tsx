/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/ui/provider";

import { enemyById } from "../entities/enemies/catalog";
import { C, Small, Text } from "./kit";

/** How close a boss has to be before its bar takes the top of the screen. */
export const BOSS_BAR_RANGE = 55;

export interface BossReading {
  id: string;
  name: string;
  health: number;
  max: number;
  shield: number;
  shieldMax: number;
}

/** The nearest living boss within range of the player, or null. */
export function bossInRange(ctx: GameContext): BossReading | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  let best: { reading: BossReading; d: number } | null = null;
  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def?.family !== "boss") continue;
    const health = ctx.scene.entity.stats.get(entity.id, "health");
    if (health === null || health.current <= 0) continue;
    const d = Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]);
    if (d > BOSS_BAR_RANGE || (best !== null && d >= best.d)) continue;
    const shield = ctx.scene.entity.stats.get(entity.id, "shield");
    best = { d, reading: { id: entity.id, name: def.name, health: health.current, max: health.max, shield: shield?.current ?? 0, shieldMax: shield?.max ?? 0 } };
  }
  return best?.reading ?? null;
}

/**
 * The boss fight's banner: the appliance's name across the top and one long bar, its force field in
 * blue over its health in red. It appears when a boss is within {@link BOSS_BAR_RANGE} and alive.
 */
export function BossBar() {
  const ctx = useGameContext();
  const { width } = useRuneViewport();
  const barWidth = Math.min(560, width - 48);
  const read = () => bossInRange(ctx);
  return <RuneView anchor="top" safe inset={14} items="center" gap={4} hidden={bind(() => read() === null)}>
    <Text family="Russo One" size={20} tracking={3} color={C.amber} text={bind(() => (read()?.name ?? "").toUpperCase())} />
    <RuneView width={barWidth} height={14} fill="#00000099" border={{ width: 2, color: "#1b1f2a" }} radius={3} clip>
      <RuneView height={14} fill={C.red} width={bind(() => { const r = read(); return { fraction: r === null || r.max <= 0 ? 0 : Math.max(0, Math.min(1, r.health / r.max)) }; })} />
    </RuneView>
    <RuneView width={barWidth} height={5} fill="#00000066" radius={2} clip hidden={bind(() => (read()?.shieldMax ?? 0) <= 0)}>
      <RuneView height={5} fill={C.shield} width={bind(() => { const r = read(); return { fraction: r === null || r.shieldMax <= 0 ? 0 : Math.max(0, Math.min(1, r.shield / r.shieldMax)) }; })} />
    </RuneView>
    <Small size={10} color={C.ink} text={bind(() => { const r = read(); return r === null ? "" : `${Math.ceil(r.health)} / ${Math.ceil(r.max)}`; })} />
  </RuneView>;
}
