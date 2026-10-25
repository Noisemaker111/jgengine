import { createCombatIntensity, DEFAULT_ADAPTIVE_TIERS, type AdaptiveMusicConfig } from "@jgengine/core/audio/adaptiveMusic";
import { createMusicState, resolveMusicState } from "@jgengine/core/audio/musicState";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { DamageAppliedEvent } from "@jgengine/core/game/events";

/** The slice of the game an adaptive soundtrack listens to. @internal */
export interface AdaptiveMusicSource {
  on(event: "combat.damage", handler: (event: DamageAppliedEvent) => void): () => void;
  /** Whether an id is the local player or what they drive. */
  isLocal(id: string | undefined): boolean;
}

/** How often the tier is re-resolved, milliseconds. */
const TICK_MS = 250;

/**
 * Drive the soundtrack from the fight: hits dealt, hits taken and kills raise an intensity that
 * decays over quiet time, and the tier ladder crossfades the theme. Returns the teardown. @internal
 */
export function attachAdaptiveMusic(
  source: AdaptiveMusicSource,
  playMusic: (theme: string | null) => void,
  config: AdaptiveMusicConfig = {},
  now: () => number = () => performance.now(),
): () => void {
  const tiers = { tiers: config.tiers ?? DEFAULT_ADAPTIVE_TIERS, release: config.release };
  const intensity = createCombatIntensity(config.decayPerSecond ?? 0.1);
  let state = createMusicState();
  let theme: string | null = null;
  let changes = 0;

  const tick = () => {
    const result = resolveMusicState(state, { intensity: intensity.read(now()), nowMs: now() }, tiers);
    state = result.state;
    if (!result.changed) return;
    theme = result.theme;
    changes += 1;
    playMusic(result.theme);
  };

  const off = source.on("combat.damage", (event) => {
    if (event.amount <= 0) return;
    let amount = 0;
    if (source.isLocal(event.target)) amount += config.onHurt ?? 0.3;
    if (source.isLocal(event.source)) amount += (config.onHit ?? 0.18) + (event.lethal ? config.onKill ?? 0.15 : 0);
    if (amount === 0) return;
    intensity.bump(amount, now());
    tick();
  });
  const offProbe = devtools.probes.registerSystem("audio/adaptiveMusic", {
    counters: () => ({ intensityPct: Math.round(intensity.read(now()) * 100), changes }),
    state: () => `${state.tierId ?? "none"} · ${theme ?? "silent"} · intensity ${intensity.read(now()).toFixed(2)}`,
  });
  tick();
  const timer = setInterval(tick, TICK_MS);
  return () => {
    clearInterval(timer);
    off();
    offProbe();
  };
}
