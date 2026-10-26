/** Motor intensities, each `0..1`: `strong` is the low-frequency motor, `weak` the high-frequency one. */
export interface HapticLevel {
  strong: number;
  weak: number;
}

/** A decaying one-shot on a channel: starts at `strong`/`weak` and fades to zero over `ms`. */
export interface HapticPulse extends HapticLevel {
  ms: number;
}

/** Options for {@link createHapticChannels}. */
export interface HapticChannelsOptions {
  /** Scale applied to channels below the highest active priority (default `0.4`), so an impact cuts through the engine hum. */
  duck?: number;
}

/** Serializable channel state. */
export interface HapticChannelsSnapshot {
  duck: number;
  channels: { name: string; strong: number; weak: number; priority: number; remainingMs: number | null; totalMs: number | null }[];
}

/**
 * Named continuous rumble channels for one player, mixed by priority each frame. Game code sets
 * levels from its own telemetry (engine rpm, road surface, impacts); the shell mixes and drives the pad.
 */
export interface HapticChannels {
  /** Hold a channel at a level until changed; `0`/`0` silences it. Higher `priority` (default `0`) ducks lower channels. */
  set(channel: string, level: HapticLevel, priority?: number): void;
  /** Start a fading one-shot on a channel, replacing what it held. */
  pulse(channel: string, pulse: HapticPulse, priority?: number): void;
  /** Silence one channel, or all of them. */
  clear(channel?: string): void;
  /** Advance pulses by `dt` seconds and return the mixed level. */
  mix(dt: number): HapticLevel;
  /** The last mixed level. */
  level(): HapticLevel;
  retune(options: HapticChannelsOptions): void;
  snapshot(): HapticChannelsSnapshot;
  restore(snapshot: HapticChannelsSnapshot): void;
}

interface Channel {
  strong: number;
  weak: number;
  priority: number;
  remainingMs: number | null;
  totalMs: number | null;
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * Per-player haptic channels mixed by priority.
 * @capability haptics Continuous gamepad rumble from named channels (engine, road, impact) mixed by priority, plus fading pulses.
 */
export function createHapticChannels(options: HapticChannelsOptions = {}): HapticChannels {
  let duck = clamp01(options.duck ?? 0.4);
  const channels = new Map<string, Channel>();
  const last: HapticLevel = { strong: 0, weak: 0 };

  const write = (name: string, channel: Channel) => {
    if (channel.strong === 0 && channel.weak === 0) channels.delete(name);
    else channels.set(name, channel);
  };

  return {
    set(name, level, priority = 0) {
      write(name, { strong: clamp01(level.strong), weak: clamp01(level.weak), priority, remainingMs: null, totalMs: null });
    },
    pulse(name, pulse, priority = 0) {
      const ms = Math.max(0, pulse.ms);
      if (ms === 0) {
        channels.delete(name);
        return;
      }
      write(name, { strong: clamp01(pulse.strong), weak: clamp01(pulse.weak), priority, remainingMs: ms, totalMs: ms });
    },
    clear(name) {
      if (name === undefined) channels.clear();
      else channels.delete(name);
    },
    mix(dt) {
      const stepMs = Math.max(0, dt) * 1000;
      let top = -Infinity;
      for (const [name, channel] of channels) {
        if (channel.remainingMs !== null) {
          channel.remainingMs -= stepMs;
          if (channel.remainingMs <= 0) {
            channels.delete(name);
            continue;
          }
        }
        if (channel.priority > top) top = channel.priority;
      }
      let strong = 0;
      let weak = 0;
      for (const channel of channels.values()) {
        const fade = channel.remainingMs === null || channel.totalMs === null ? 1 : channel.remainingMs / channel.totalMs;
        const scale = (channel.priority >= top ? 1 : duck) * fade;
        strong = Math.max(strong, channel.strong * scale);
        weak = Math.max(weak, channel.weak * scale);
      }
      last.strong = strong;
      last.weak = weak;
      return last;
    },
    level: () => last,
    retune(next) {
      duck = clamp01(next.duck ?? duck);
    },
    snapshot() {
      return { duck, channels: [...channels].map(([name, channel]) => ({ name, ...channel })) };
    },
    restore(snapshot) {
      duck = clamp01(snapshot.duck);
      channels.clear();
      for (const { name, ...channel } of snapshot.channels) channels.set(name, { ...channel });
    },
  };
}
