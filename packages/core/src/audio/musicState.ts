/**
 * Hysteretic music-state selector: turns a continuous intensity signal (nearby threat,
 * alert count, chase proximity) into a stable theme id. The engine can already crossfade
 * a soundtrack; this decides *when*, without the flapping a bare threshold produces when
 * one enemy walks in and out of range.
 */
export interface MusicTier {
  id: string;
  /** Theme id passed to `ctx.game.audio.music`; null silences the soundtrack in this tier. */
  theme: string | null;
  /** Intensity at or above which this tier may be entered. */
  enter: number;
  /** Minimum time in this tier before it may drop to a lower one. Default 0. */
  holdMs?: number;
}

/** The tier ladder plus the release margin that keeps a hovering intensity from flapping between tiers. */
export interface MusicStateConfig {
  /** Ordered or unordered; the highest `enter` at or below the intensity wins. */
  tiers: readonly MusicTier[];
  /** Intensity must fall this far below a tier's `enter` before leaving it. Default 0.2. */
  release?: number;
}

/** Which tier is playing and when it was entered, on the caller's clock. Serialisable. */
export interface MusicStateSnapshot {
  tierId: string | null;
  /** Timestamp the current tier was entered, on the caller's clock. */
  sinceMs: number;
}

/** The current intensity signal and clock reading for one resolve. */
export interface MusicStateInput {
  intensity: number;
  nowMs: number;
}

/** Next state, the theme that should be playing, and whether this advance is the one that changed it. */
export interface MusicStateResult {
  state: MusicStateSnapshot;
  theme: string | null;
  /** True only on the advance the tier changed — the caller's cue to crossfade. */
  changed: boolean;
}

/** Fresh state with no tier entered, so the first resolve always settles and reports `changed`. */
export function createMusicState(): MusicStateSnapshot {
  return { tierId: null, sinceMs: 0 };
}

function tierById(config: MusicStateConfig, id: string | null): MusicTier | undefined {
  return id === null ? undefined : config.tiers.find((tier) => tier.id === id);
}

function highestTierAt(config: MusicStateConfig, intensity: number): MusicTier | undefined {
  let best: MusicTier | undefined;
  for (const tier of config.tiers) {
    if (intensity < tier.enter) continue;
    if (best === undefined || tier.enter > best.enter) best = tier;
  }
  return best;
}

/**
 * Pick the theme for the current intensity. Escalation is immediate; de-escalation waits for the
 * tier's `holdMs` and needs the intensity to fall a `release` margin below the tier it is leaving.
 */
export function resolveMusicState(
  state: MusicStateSnapshot,
  input: MusicStateInput,
  config: MusicStateConfig,
): MusicStateResult {
  const current = tierById(config, state.tierId);
  const candidate = highestTierAt(config, input.intensity) ?? config.tiers.find((tier) => tier.enter <= 0);

  if (current !== undefined && candidate !== undefined && candidate.enter < current.enter) {
    const release = config.release ?? 0.2;
    const heldLongEnough = input.nowMs - state.sinceMs >= (current.holdMs ?? 0);
    if (!heldLongEnough || input.intensity > current.enter - release) {
      return { state, theme: current.theme, changed: false };
    }
  }

  const next = candidate ?? current;
  if (next === undefined) return { state, theme: null, changed: false };
  if (next.id === state.tierId) return { state, theme: next.theme, changed: false };
  return { state: { tierId: next.id, sinceMs: input.nowMs }, theme: next.theme, changed: true };
}
