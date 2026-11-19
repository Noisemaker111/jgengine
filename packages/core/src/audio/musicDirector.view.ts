import { notesInWindow, themeLoopSeconds, type MusicTheme } from "@jgengine/core/audio/music";

import { playMusicNote } from "./musicVoices.view";
import { seededRng } from "../random/rng";

// Noise and timbre jitter are sound, not simulation: a fixed stream keeps a render or a capture the same every run.
const noise = seededRng("jg:music-reverb");

const LOOKAHEAD = 0.6;
const TICK_MS = 110;
const FADE_IN = 0.75;
const FADE_OUT = 0.35;
const MASTER_BASE = 0.2;

interface Layer {
  theme: MusicTheme;
  gain: GainNode;
  trim: number;
  active: boolean;
  target: number;
  anchor: number;
  nextFrom: number;
  transpose: number;
}

export interface CrossfadeOptions {
  transpose?: number;
  /** Seconds into the incoming theme's loop to start from, so a radio tuned back in lands mid-song. Default 0. */
  offset?: number;
}

export class MusicDirector {
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly reverbSend: GainNode;
  private readonly layers = new Map<string, Layer>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private volume = 1;
  private current: string | null = null;

  constructor(ctx: BaseAudioContext, destination: AudioNode, themes: Record<string, MusicTheme>) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_BASE;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.2;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.25;
    this.master.connect(compressor);
    compressor.connect(destination);

    const irSeconds = 2.6;
    const len = Math.floor(ctx.sampleRate * irSeconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i += 1) data[i] = (noise() * 2 - 1) * (1 - i / len) ** 2.4;
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(reverb);
    reverb.connect(this.master);

    for (const [id, theme] of Object.entries(themes)) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      gain.connect(this.reverbSend);
      this.layers.set(id, {
        theme,
        gain,
        trim: theme.trim ?? 1,
        active: false,
        target: 0,
        anchor: 0,
        nextFrom: 0,
        transpose: 0,
      });
    }

    if (typeof setInterval === "function") {
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  /** The currently faded-in theme id, or null when music is stopped. */
  currentTheme(): string | null {
    return this.current;
  }

  crossfadeTo(themeId: string | null, options: CrossfadeOptions = {}): void {
    if (themeId === this.current) return;
    this.current = themeId;
    const now = this.ctx.currentTime;
    for (const [id, layer] of this.layers) {
      const target = id === themeId ? layer.trim : 0;
      if (layer.target === target) continue;
      const rising = target > layer.target;
      layer.target = target;
      layer.gain.gain.setTargetAtTime(target, now, rising ? FADE_IN : FADE_OUT);
      if (rising) {
        layer.active = true;
        const start = now + 0.15;
        const offset = options.offset !== undefined && Number.isFinite(options.offset) ? Math.max(0, options.offset) : 0;
        layer.anchor = start - offset;
        layer.nextFrom = start - 1e-6;
        layer.transpose = options.transpose ?? 0;
      } else {
        layer.active = false;
      }
    }
  }

  /** Music volume 0..1, scaling the master gain. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, volume);
    this.master.gain.value = MASTER_BASE * this.volume;
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.master.disconnect();
    this.reverbSend.disconnect();
  }

  private tick(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    const spbAvailable = 60;
    for (const layer of this.layers.values()) {
      if (!layer.active) continue;
      if (themeLoopSeconds(layer.theme) <= 0) continue;
      const spb = spbAvailable / layer.theme.bpm;
      const notes = notesInWindow(layer.theme, layer.anchor, layer.nextFrom, horizon);
      for (const { event, when } of notes) {
        playMusicNote(this.ctx, event, when, spb, layer.gain, layer.transpose);
      }
      layer.nextFrom = horizon;
    }
  }
}
