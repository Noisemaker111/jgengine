export interface MusicTier {
  id: string;
  theme: string | null;
  enter: number;
  holdMs?: number;
}

export interface MusicStateConfig {
  tiers: readonly MusicTier[];
  /** Intensity must fall this far below a tier's `enter` before leaving it. Default 0.2. */
  release?: number | undefined;
}

export interface MusicStateSnapshot {
  tierId: string | null;
  sinceMs: number;
}

export interface MusicStateInput {
  intensity: number;
  nowMs: number;
}

export interface MusicStateResult {
  state: MusicStateSnapshot;
  theme: string | null;
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
