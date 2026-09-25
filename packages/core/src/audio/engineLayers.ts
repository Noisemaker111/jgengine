/** One recorded engine sample, keyed by the rpm it was recorded at. */
export interface EngineLayer {
  /** Catalog sound id of the loop. */
  sound: string;
  /** Rpm the sample was recorded at; playback rate is `rpm / layer.rpm`. */
  rpm: number;
  /** Which load set the layer belongs to: `"on"` (throttle), `"off"` (coast/overrun) or `"any"` (always). Default `"any"`. */
  load?: "on" | "off" | "any";
  /** Extra gain for this layer. Default 1. */
  gain?: number;
}

/** Config for {@link createEngineLayers}. */
export interface EngineLayersConfig {
  /** Prefix for the retained loop ids, one per layer: `${id}:${index}`. */
  id: string;
  layers: readonly EngineLayer[];
  /** Load window the off-load set crossfades to the on-load set across. Default `[0.15, 0.6]`. */
  loadCrossfade?: readonly [number, number];
  /** Exponential rate the load follows `engineLoad` with, so a lifted throttle does not click between sets. Default 10. */
  loadResponse?: number;
}

/** One layer's live mix. */
export interface EngineLayerMix {
  /** Retained loop id. */
  id: string;
  sound: string;
  gain: number;
  rate: number;
}

/** Serializable {@link EngineLayers} state. */
export interface EngineLayersState {
  load: number;
}

/** Per-tick parameters {@link EngineLayers.play} forwards to every layer's loop. */
export interface EngineLayersPlayOptions {
  at?: readonly [number, number, number];
  velocity?: readonly [number, number, number];
  /** Overall gain multiplier. Default 1. */
  gain?: number;
  lowpass?: number;
  highpass?: number;
}

/** The part of `ctx.game.audio` {@link EngineLayers} drives. */
export interface EngineLayersAudio {
  loop(id: string, sound: string, options?: { at?: readonly [number, number, number] }): void;
  setLoop(
    id: string,
    params: {
      rate?: number;
      gain?: number;
      at?: readonly [number, number, number];
      velocity?: readonly [number, number, number];
      lowpass?: number;
      highpass?: number;
    },
  ): void;
  stopLoop(id: string): void;
}

/** A layered engine loop: N rpm-keyed samples crossfaded by rpm, with on- and off-load sets picked by engine load. */
export interface EngineLayers {
  /** Advance by `dt` and return each layer's gain and rate. The returned array and its entries are reused between calls. */
  update(dt: number, signals: { rpm: number; load: number }): readonly EngineLayerMix[];
  /** Start (idempotently) and update every layer's retained loop from the last {@link update}. */
  play(audio: EngineLayersAudio, options?: EngineLayersPlayOptions): void;
  /** Stop every layer's loop. */
  stop(audio: EngineLayersAudio): void;
  mix(): readonly EngineLayerMix[];
  retune(next: EngineLayersConfig): void;
  snapshot(): EngineLayersState;
  restore(state: EngineLayersState): void;
  reset(): void;
}

interface LayerIndex {
  on: number[];
  off: number[];
  any: number[];
}

function indexLayers(layers: readonly EngineLayer[]): LayerIndex {
  const byRpm = (a: number, b: number) => layers[a]!.rpm - layers[b]!.rpm;
  const index: LayerIndex = { on: [], off: [], any: [] };
  layers.forEach((layer, i) => index[layer.load ?? "any"].push(i));
  if (index.on.length === 0 || index.off.length === 0) {
    index.any.push(...index.on, ...index.off);
    index.on = [];
    index.off = [];
  }
  index.on.sort(byRpm);
  index.off.sort(byRpm);
  index.any.sort(byRpm);
  return index;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Layered engine sound: each set of rpm-keyed samples is equal-power crossfaded between the two
 * samples bracketing the current rpm and pitched by `rpm / layer.rpm`; the on- and off-load sets are
 * equal-power crossfaded by smoothed `engineLoad`. A config with only one load set plays it at every
 * load. `play` drives `ctx.game.audio` directly, so a game needs no per-layer glue.
 *
 * @capability engine-layers layered engine audio: rpm-keyed samples crossfaded, with on-load and off-load sets picked by engine load
 */
export function createEngineLayers(initial: EngineLayersConfig): EngineLayers {
  let config = initial;
  let index = indexLayers(config.layers);
  let mixes: EngineLayerMix[] = [];
  let load = 0;
  const params: {
    rate?: number;
    gain?: number;
    at?: readonly [number, number, number];
    velocity?: readonly [number, number, number];
    lowpass?: number;
    highpass?: number;
  } = {};

  function rebuild(): void {
    index = indexLayers(config.layers);
    mixes = config.layers.map((layer, i) => ({ id: `${config.id}:${i}`, sound: layer.sound, gain: 0, rate: 1 }));
  }
  rebuild();

  function crossfade(set: readonly number[], rpm: number, weight: number): void {
    if (set.length === 0 || weight <= 0) return;
    const layers = config.layers;
    let upper = 0;
    while (upper < set.length && layers[set[upper]!]!.rpm < rpm) upper += 1;
    if (upper === 0 || upper === set.length) {
      const only = set[upper === 0 ? 0 : set.length - 1]!;
      mixes[only]!.gain += weight;
      return;
    }
    const lowIndex = set[upper - 1]!;
    const highIndex = set[upper]!;
    const low = layers[lowIndex]!.rpm;
    const high = layers[highIndex]!.rpm;
    const t = high > low ? (rpm - low) / (high - low) : 1;
    mixes[lowIndex]!.gain += weight * Math.cos((t * Math.PI) / 2);
    mixes[highIndex]!.gain += weight * Math.sin((t * Math.PI) / 2);
  }

  return {
    update(dt, signals) {
      const rpm = Number.isFinite(signals.rpm) ? Math.max(0, signals.rpm) : 0;
      const target = Number.isFinite(signals.load) ? Math.min(1, Math.max(0, signals.load)) : 0;
      const response = config.loadResponse ?? 10;
      load = Number.isFinite(response) ? load + (target - load) * (1 - Math.exp(-response * Math.max(0, dt))) : target;
      const [from, to] = config.loadCrossfade ?? [0.15, 0.6];
      const onWeight = smoothstep(from, to, load);
      for (let i = 0; i < mixes.length; i += 1) {
        const layer = config.layers[i]!;
        mixes[i]!.gain = 0;
        mixes[i]!.rate = layer.rpm > 0 ? rpm / layer.rpm : 1;
      }
      crossfade(index.any, rpm, 1);
      crossfade(index.on, rpm, Math.sin((onWeight * Math.PI) / 2));
      crossfade(index.off, rpm, Math.cos((onWeight * Math.PI) / 2));
      for (let i = 0; i < mixes.length; i += 1) mixes[i]!.gain *= config.layers[i]!.gain ?? 1;
      return mixes;
    },
    play(audio, options = {}) {
      const scale = options.gain ?? 1;
      const loopOptions = options.at === undefined ? undefined : { at: options.at };
      params.at = options.at;
      params.velocity = options.velocity;
      params.lowpass = options.lowpass;
      params.highpass = options.highpass;
      for (const mix of mixes) {
        audio.loop(mix.id, mix.sound, loopOptions);
        params.rate = mix.rate;
        params.gain = mix.gain * scale;
        audio.setLoop(mix.id, params);
      }
    },
    stop(audio) {
      for (const mix of mixes) audio.stopLoop(mix.id);
    },
    mix: () => mixes,
    retune(next) {
      config = next;
      rebuild();
    },
    snapshot: () => ({ load }),
    restore(state) {
      load = state.load;
    },
    reset() {
      load = 0;
      for (const mix of mixes) {
        mix.gain = 0;
        mix.rate = 1;
      }
    },
  };
}
