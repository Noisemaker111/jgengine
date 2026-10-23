import { activeAmbienceZone, ambienceWeights, type AmbienceWeight, type AmbienceZoneDef } from "@jgengine/core/audio/ambience";
import { distance3, resolveEmitterGain, type AudioBusDef, type SoundDef } from "@jgengine/core/audio/audioFalloff";
import { dopplerRate } from "@jgengine/core/audio/doppler";
import { resolveOcclusionConfig, type AudioOcclusionConfig, type ResolvedAudioOcclusionConfig } from "@jgengine/core/audio/occlusion";
import type { MusicTheme } from "@jgengine/core/audio/music";
import { patchDuration, type SynthPatch } from "@jgengine/core/audio/synth";
import { createVoiceAllocator, type VoiceAllocator, type VoiceAllocatorConfig } from "@jgengine/core/audio/voiceAllocator";
import { createDisposer } from "@jgengine/core/game/defineGame";

import { clampLoopCutoff, clampLoopGain, clampLoopRate, MIN_LOOP_CUTOFF, MAX_LOOP_CUTOFF } from "./loopParams";
import { MusicDirector, type CrossfadeOptions } from "./musicDirector";
import { createNoiseBuffer, realizeSynthPatch, type SynthPlayback } from "./synthEngine";

/** setTargetAtTime time constant (~20 ms) for zipper-free live rate/gain ramps on retained loops (#1051). */
const LOOP_PARAM_SMOOTH_TC = 0.02;

/** Ambient beds ramp over ~80 ms so crossing a zone boundary never steps a gain. */
const BED_SMOOTH_TC = 0.08;

/** Ducking ramps over ~30 ms: fast enough to feel like a cut, slow enough not to click. */
const DUCK_SMOOTH_TC = 0.03;

const ZERO_VELOCITY: Vec3 = { x: 0, y: 0, z: 0 };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Position and orientation for a spatial-audio listener. */
export interface ListenerPose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  /** World velocity of the listener, for doppler on loops whose sound declares `doppler`. Default zero. */
  velocity?: Vec3;
}

export interface AudioSceneConfig {
  sounds?: Record<string, SoundDef>;
  /** SFX playback/patch slots, including pending loads; individual synth oscillators share one slot. Default 64; zero disables SFX. */
  maxVoices?: number;
  /** Budget overflow policy. Default "steal-lowest"; lower priorities never steal higher ones. */
  voiceOverflow?: VoiceAllocatorConfig["overflow"];
  /** Dedicated caller-owned allocator for inspectable reservations and injected storage. Music has its own lifecycle. */
  voiceAllocator?: VoiceAllocator;
  buses?: Record<string, AudioBusDef>;
  /** Procedural music themes, crossfaded by {@link AudioEngine.playMusic}. Mixed through the `musicBus` (default "music") so the settings volume applies. */
  music?: Record<string, MusicTheme>;
  /** Bus id the procedural music director mixes through. Default "music". */
  musicBus?: string;
  /** World-space ambience zones; each becomes one retained looping bed driven by the listener position. */
  zones?: readonly AmbienceZoneDef[];
  /** Geometry occlusion budget/policy for retained positional loops. Unset keeps the defaults; `false` keeps distance-only. */
  occlusion?: AudioOcclusionConfig | false;
}

export interface AudioEmitterHandle {
  /** Whether playback is reserved or playing; false after stop, stealing, failed load, or natural end. Optional for legacy hosts. */
  isPlaying?(): boolean;
  setPosition(position: Vec3): void;
  /** Live pitch of a retained loop: `rate` multiplies the authored playback rate (1 = authored), clamped to 0.25–4 and ramped ~20 ms to avoid zipper noise (#1051). */
  setRate(rate: number): void;
  /** Live volume of a retained loop: `gain` scales the source (0–1), clamped and ramped ~20 ms (#1051). */
  setGain(gain: number): void;
  /** Live lowpass cutoff of a retained loop in Hz, clamped and ramped like rate. */
  setLowpass(hz: number): void;
  /** Live highpass cutoff of a retained loop in Hz, clamped and ramped like rate. */
  setHighpass(hz: number): void;
  /** Emitter world velocity for doppler; ignored unless the sound declares `doppler`. */
  setVelocity(velocity: Vec3): void;
  /** Geometry occlusion, 0 (clear line) to 1 (fully blocked): scales the loop's gain and darkens it, composed with the game's own gain and filter. */
  setOcclusion(amount: number): void;
  stop(): void;
}

/** How long and how far to duck buses for {@link AudioEngine.duck}. */
export interface DuckOptions {
  /** How far to lower the buses, 0..1. Default 0.6. */
  amount?: number;
  /** Seconds to hold the duck; omit to hold until the returned release runs. */
  seconds?: number;
  /** Fade time constant in seconds. Default 0.03. */
  fadeSeconds?: number;
}

/** Measured geometry-occlusion work, cumulative since the engine was created. */
export interface AudioOcclusionStats {
  /** Geometry tests run. */
  tests: number;
  /** Tests that found blocking geometry. */
  blocked: number;
  /** Total time spent inside the injected geometry test, milliseconds. */
  testMs: number;
  /** Mean milliseconds per test, or 0 before the first test. */
  perTestMs: number;
  /** Endpoints and result of the newest test, for a probe explaining what the engine actually asked. */
  lastTest: { from: Vec3; to: Vec3; blocked: boolean } | null;
}

/** Current ambience mix, by zone id. */
export interface AudioAmbienceState {
  /** Loudest zone, or null when the listener is outside every zone. */
  zone: string | null;
  /** Non-silent zone beds with their smoothed target level (`0..1`). */
  levels: readonly { id: string; level: number }[];
}

export interface AudioEngine {
  /** Full listener orientation, or a legacy position using forward -Z and up +Y. */
  setListenerPose(pose: ListenerPose | Vec3): void;
  /** Retune the SFX budget and optional admission policy, stopping the lowest-priority oldest voices first. */
  setVoiceLimit(maxTotal: number, overflow?: VoiceAllocatorConfig["overflow"]): void;
  /**
   * One-call playback. Before a user gesture the browser keeps the context suspended, so the cue is
   * held in a small bounded queue and played when {@link resume} succeeds instead of being dropped
   * silently. Allocation happens per played cue, never per frame.
   */
  play(soundId: string, position?: Vec3): void;
  playOneShot(soundId: string, position?: Vec3): void;
  playLoop(soundId: string, position?: Vec3): AudioEmitterHandle | null;
  /** Crossfade the procedural soundtrack to `themeId` (null fades out). No-op when no `music` catalog is configured. */
  playMusic(themeId: string | null, options?: CrossfadeOptions): void;
  /**
   * Install the scene's blocking-geometry test (`from` listener, `to` emitter), or null to stop
   * testing. The engine owns the per-tick budget; tests never run outside it.
   */
  setOcclusionSource(blocked: ((from: Vec3, to: Vec3) => boolean) | null): void;
  /** Cumulative occlusion cost, for a capture probe or a perf readout. */
  occlusionStats(): AudioOcclusionStats;
  /** Current zone mix, for a capture probe or a HUD readout. */
  ambience(): AudioAmbienceState;
  /**
   * Lower one bus for its duration and restore exactly the player's own level, even if they move
   * the slider while it is ducked. Returns an idempotent release.
   * @capability audio-ducking a cue with a `duck` policy lowers the music or ambience bus for its duration and restores the player's own gain exactly, even when the slider moves mid-duck.
   */
  duck(busId: string, options?: DuckOptions): () => void;
  setBusGain(busId: string, gain: number): void;
  /** Mute one bus without losing its gain: unmuting restores exactly the volume the player set. */
  setBusMute(busId: string, muted: boolean): void;
  setMasterGain(gain: number): void;
  setMasterMute(muted: boolean): void;
  /** Master gain after volume and mute compose (`gain × (muted ? 0 : 1)`). */
  masterLevel(): number;
  /** Effective gain of `busId` after its authored gain, the player's volume and its mute compose. */
  busLevel(busId: string): number;
  /**
   * Peak and RMS of the master output sampled on the Web Audio render clock. Pools its buffers, so
   * calling it every frame allocates nothing; a silent (or unsupported) engine reports `0`.
   */
  measure(): AudioLevel;
  resume(): void;
  dispose(): void;
}

/** Master-output level, `0..1`. Pooled by {@link AudioEngine.measure} - read it, don't retain it. */
export interface AudioLevel {
  rms: number;
  peak: number;
}

/** Cues held while the browser keeps the audio context suspended, before any user gesture. */
export const MAX_PENDING_CUES = 16;

function createNoopEngine(): AudioEngine {
  const level: AudioLevel = { rms: 0, peak: 0 };
  const stats: AudioOcclusionStats = { tests: 0, blocked: 0, testMs: 0, perTestMs: 0, lastTest: null };
  return {
    setListenerPose: () => undefined,
    setVoiceLimit: () => undefined,
    play: () => undefined,
    playOneShot: () => undefined,
    playLoop: () => null,
    playMusic: () => undefined,
    setOcclusionSource: () => undefined,
    occlusionStats: () => stats,
    ambience: () => ({ zone: null, levels: [] }),
    duck: () => () => undefined,
    setBusGain: () => undefined,
    setBusMute: () => undefined,
    setMasterGain: () => undefined,
    setMasterMute: () => undefined,
    masterLevel: () => 0,
    busLevel: () => 0,
    measure: () => level,
    resume: () => undefined,
    dispose: () => undefined,
  };
}

function resolveAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

function resolveOfflineAudioContextCtor(): typeof OfflineAudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  );
}

function setAudioParam(param: AudioParam | undefined, value: number): void {
  if (param === undefined) return;
  param.value = value;
}

function setPannerPosition(panner: PannerNode, position: Vec3): void {
  setAudioParam(panner.positionX, position.x);
  setAudioParam(panner.positionY, position.y);
  setAudioParam(panner.positionZ, position.z);
}

function createPanner(context: BaseAudioContext, spatial: NonNullable<SoundDef["spatial"]>, position: Vec3): PannerNode {
  const panner = context.createPanner();
  try {
    panner.panningModel = spatial.panning === "hrtf" ? "HRTF" : "equalpower";
    panner.distanceModel = "inverse";
    if (spatial.refDistance !== undefined) panner.refDistance = spatial.refDistance;
    if (spatial.maxDistance !== undefined) panner.maxDistance = spatial.maxDistance;
    if (spatial.rolloff !== undefined) panner.rolloffFactor = spatial.rolloff;
    if (spatial.coneInner !== undefined) panner.coneInnerAngle = spatial.coneInner;
    if (spatial.coneOuter !== undefined) panner.coneOuterAngle = spatial.coneOuter;
    if (spatial.coneOuterGain !== undefined) panner.coneOuterGain = spatial.coneOuterGain;
    setPannerPosition(panner, position);
  } catch (error) {
    panner.disconnect();
    throw error;
  }
  return panner;
}

/**
 * Game-owned sound catalog playback with bounded SFX reservations, spatial panning, and shared buses.
 * @capability bounded-spatial-audio play positional or flat cues with listener orientation, voice budgets, and per-source cleanup
 */
export function createAudioEngine(config: AudioSceneConfig = {}): AudioEngine {
  const sounds = config.sounds ?? {};
  const allocator = config.voiceAllocator ?? createVoiceAllocator({ maxTotal: config.maxVoices, overflow: config.voiceOverflow });
  let disposed = false;
  const activeVoices = new Map<number, () => void>();
  const busDefs = config.buses ?? {};
  const AudioContextCtor = resolveAudioContextCtor();
  if (AudioContextCtor === undefined) return createNoopEngine();

  let context: AudioContext;
  let masterGain: GainNode;
  try {
    context = new AudioContextCtor();
    masterGain = context.createGain();
    masterGain.connect(context.destination);
  } catch {
    return createNoopEngine();
  }

  const busGains = new Map<string, GainNode>();
  // Authored gain survives a mute, so unmuting restores the player's volume exactly. `duck` is a
  // separate multiplier a cue applies for its own duration, so it never overwrites that volume.
  const busMix = new Map<string, { gain: number; muted: boolean; duck: number }>();
  let masterVolume = 1;
  let masterMuted = false;

  function applyMaster(): void {
    masterGain.gain.value = masterLevel();
  }

  function masterLevel(): number {
    return masterMuted ? 0 : masterVolume;
  }

  function busMixOf(busId: string): { gain: number; muted: boolean; duck: number } {
    let mix = busMix.get(busId);
    if (mix === undefined) {
      mix = { gain: busDefs[busId]?.gain ?? 1, muted: false, duck: 0 };
      busMix.set(busId, mix);
    }
    return mix;
  }

  function busLevel(busId: string): number {
    const mix = busMix.get(busId);
    if (mix === undefined) return busDefs[busId]?.gain ?? 1;
    if (mix.muted) return 0;
    return mix.gain * (1 - mix.duck);
  }

  function busGainNode(busId: string): GainNode {
    let node = busGains.get(busId);
    if (node === undefined) {
      node = context.createGain();
      try {
        node.gain.value = busLevel(busId);
        node.connect(masterGain);
        busGains.set(busId, node);
      } catch (error) {
        node.disconnect();
        throw error;
      }
    }
    return node;
  }

  function applyBus(busId: string): void {
    const node = busGains.get(busId);
    if (node !== undefined) node.gain.value = busLevel(busId);
  }

  interface DuckHold {
    amount: number;
    timer: ReturnType<typeof setTimeout> | undefined;
  }
  const duckHolds = new Map<string, Set<DuckHold>>();

  /** Recompute the strongest hold on one bus; release restores the player's gain by construction. */
  function applyDuck(busId: string): void {
    const holds = duckHolds.get(busId);
    let amount = 0;
    if (holds !== undefined) {
      for (const hold of holds) amount = Math.max(amount, hold.amount);
    }
    const mix = busMixOf(busId);
    mix.duck = Math.min(1, Math.max(0, amount));
    const node = busGains.get(busId);
    if (node === undefined) return;
    const level = busLevel(busId);
    if (typeof node.gain.setTargetAtTime === "function") {
      node.gain.setTargetAtTime(level, context.currentTime, DUCK_SMOOTH_TC);
    } else {
      node.gain.value = level;
    }
  }

  function duckBus(busId: string, options: DuckOptions = {}): () => void {
    if (disposed) return () => undefined;
    const amount = Math.min(1, Math.max(0, options.amount ?? 0.6));
    if (amount <= 0) return () => undefined;
    const hold: DuckHold = { amount, timer: undefined };
    let holds = duckHolds.get(busId);
    if (holds === undefined) {
      holds = new Set();
      duckHolds.set(busId, holds);
    }
    holds.add(hold);
    applyDuck(busId);
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      if (hold.timer !== undefined) clearTimeout(hold.timer);
      const current = duckHolds.get(busId);
      current?.delete(hold);
      if (current !== undefined && current.size === 0) duckHolds.delete(busId);
      applyDuck(busId);
    };
    const seconds = options.seconds;
    if (seconds !== undefined && Number.isFinite(seconds) && seconds > 0 && typeof setTimeout === "function") {
      hold.timer = setTimeout(release, seconds * 1000);
      (hold.timer as unknown as { unref?: () => void }).unref?.();
    }
    return release;
  }

  /** A cue's own `duck` policy: hold the named buses for its duration, then release. */
  function applyCueDuck(sound: SoundDef, durationSeconds: number): void {
    const policy = sound.duck;
    if (policy === undefined) return;
    const seconds = policy.seconds !== undefined && Number.isFinite(policy.seconds) ? policy.seconds : durationSeconds;
    const buses = policy.buses ?? ["music"];
    for (const busId of buses) {
      duckBus(busId, seconds > 0 ? { amount: policy.amount, seconds } : { amount: policy.amount });
    }
  }

  let noiseBuffer: AudioBuffer | null = null;
  function sharedNoiseBuffer(): AudioBuffer {
    if (noiseBuffer === null) noiseBuffer = createNoiseBuffer(context);
    return noiseBuffer;
  }

  let director: MusicDirector | null = null;
  function musicDirector(): MusicDirector | null {
    if (config.music === undefined) return null;
    if (director === null) {
      director = new MusicDirector(context, busGainNode(config.musicBus ?? "music"), config.music);
    }
    return director;
  }

  const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
  function loadBuffer(url: string): Promise<AudioBuffer | null> {
    let pending = bufferCache.get(url);
    if (pending === undefined) {
      pending = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data))
        .catch(() => null);
      bufferCache.set(url, pending);
    }
    return pending;
  }

  // Retained synth loops render the procedural patch to one cached buffer, then loop it as a plain
  // BufferSource — so live pitch is `playbackRate` and live gain is a gain node, exactly like sample loops (#1051).
  const synthBufferCache = new Map<string, Promise<AudioBuffer | null>>();
  function renderSynthBuffer(soundId: string, patch: SynthPatch): Promise<AudioBuffer | null> {
    let pending = synthBufferCache.get(soundId);
    if (pending === undefined) {
      const OfflineCtor = resolveOfflineAudioContextCtor();
      if (OfflineCtor === undefined) {
        pending = Promise.resolve(null);
      } else {
        try {
          const seconds = Math.max(patchDuration(patch), 0.05);
          const frames = Math.max(1, Math.ceil(seconds * context.sampleRate));
          const offline = new OfflineCtor(1, frames, context.sampleRate);
          realizeSynthPatch(offline, offline.destination, createNoiseBuffer(offline), patch);
          pending = offline.startRendering().catch(() => null);
        } catch {
          pending = Promise.resolve(null);
        }
      }
      synthBufferCache.set(soundId, pending);
    }
    return pending;
  }

  let listenerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  let listenerVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  const nyquist = context.sampleRate / 2;
  const activeSpatialUpdaters = new Set<() => void>();
  // A Web Audio setter costs real time per call, so a listener pose that has not moved writes nothing (#2174).
  const listenerWritten = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
  const listenerVelocityWritten = [NaN, NaN, NaN];

  function writeChanged(slot: number[], index: number, param: AudioParam | undefined, value: number): boolean {
    if (slot[index] === value) return false;
    slot[index] = value;
    setAudioParam(param, value);
    return true;
  }

  const occlusionConfig: ResolvedAudioOcclusionConfig = resolveOcclusionConfig(config.occlusion);
  let occlusionBlocked: ((from: Vec3, to: Vec3) => boolean) | null = null;
  let occlusionTestsLeft = occlusionConfig.maxTestsPerTick;
  const occlusionStatsState: {
    tests: number;
    blocked: number;
    testMs: number;
    lastTest: { from: Vec3; to: Vec3; blocked: boolean } | null;
  } = { tests: 0, blocked: 0, testMs: 0, lastTest: null };

  interface OcclusionTarget {
    x: number;
    y: number;
    z: number;
    lastTest: number;
    tested: boolean;
    set(amount: number): void;
  }
  const occlusionTargets = new Set<OcclusionTarget>();

  function clockMs(): number {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }

  /**
   * One budgeted test for one retained loop. Skipped while the loop is too close (the listener is
   * inside its own engine hum), too far, or re-tested inside the interval; once the tick's budget
   * is spent every other loop simply stays on distance-only attenuation.
   */
  function requestOcclusionTest(target: OcclusionTarget): void {
    if (occlusionBlocked === null || occlusionConfig.maxTestsPerTick <= 0) {
      target.set(0);
      return;
    }
    const distance = distance3(target, listenerPosition);
    if (distance < 1 || distance > occlusionConfig.maxDistance) {
      target.set(0);
      return;
    }
    const now = context.currentTime;
    if (now - target.lastTest < occlusionConfig.intervalMs / 1000) return;
    if (occlusionTestsLeft <= 0) {
      if (!target.tested) target.set(0);
      return;
    }
    occlusionTestsLeft -= 1;
    target.lastTest = now;
    target.tested = true;
    const started = clockMs();
    let blocked = false;
    const from = { x: listenerPosition.x, y: listenerPosition.y, z: listenerPosition.z };
    const to = { x: target.x, y: target.y, z: target.z };
    try {
      blocked = occlusionBlocked(from, to);
    } catch {
      blocked = false;
    }
    occlusionStatsState.testMs += clockMs() - started;
    occlusionStatsState.tests += 1;
    occlusionStatsState.lastTest = { from, to, blocked };
    if (blocked) occlusionStatsState.blocked += 1;
    target.set(blocked ? 1 : 0);
  }

  function stepOcclusion(): void {
    occlusionTestsLeft = occlusionConfig.maxTestsPerTick;
    for (const target of occlusionTargets) requestOcclusionTest(target);
  }

  const zones = config.zones ?? [];
  interface ZoneBed {
    gain: GainNode;
    source: AudioBufferSourceNode | null;
    level: number;
  }
  const zoneBeds = new Map<string, ZoneBed>();
  const ambienceScratch: AmbienceWeight[] = [];
  let ambienceActive: string | null = null;
  let ambienceInitialized = false;

  function zoneWeight(id: string): number {
    for (const entry of ambienceScratch) {
      if (entry.id === id) return entry.weight;
    }
    return 0;
  }

  function ensureBed(zone: AmbienceZoneDef, sound: SoundDef): ZoneBed | null {
    const existing = zoneBeds.get(zone.id);
    if (existing !== undefined) return existing;
    let bus: GainNode;
    try {
      bus = busGainNode(sound.bus);
    } catch {
      return null;
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const bed: ZoneBed = { gain, source: null, level: -1 };
    zoneBeds.set(zone.id, bed);
    const pending = sound.synth !== undefined
      ? renderSynthBuffer(zone.sound, sound.synth)
      : sound.url !== undefined
        ? loadBuffer(sound.url)
        : Promise.resolve(null);
    void pending.then((buffer) => {
      if (disposed || buffer === null || zoneBeds.get(zone.id) !== bed) {
        gain.disconnect();
        return;
      }
      try {
        // A looping AudioBufferSourceNode repeats sample-accurately, so the bed has no gap at the seam.
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        source.start();
        bed.source = source;
        applyAmbience();
      } catch {
        gain.disconnect();
      }
    }).catch(() => undefined);
    return bed;
  }

  function applyAmbience(): void {
    if (zones.length === 0) return;
    ambienceWeights(zones, listenerPosition.x, listenerPosition.y, listenerPosition.z, ambienceScratch);
    ambienceActive = activeAmbienceZone(ambienceScratch);
    for (const zone of zones) {
      const weight = zoneWeight(zone.id);
      const existing = zoneBeds.get(zone.id);
      if (weight <= 0 && existing === undefined) continue;
      const sound = sounds[zone.sound];
      if (sound === undefined) continue;
      const bed = existing ?? ensureBed(zone, sound);
      if (bed === null) continue;
      const level = weight * (zone.gain ?? 1) * (sound.gain ?? 1);
      if (level === bed.level) continue;
      bed.level = level;
      bed.gain.gain.setTargetAtTime(level, context.currentTime, BED_SMOOTH_TC);
    }
  }

  // Browser autoplay: until the first user gesture the context stays suspended and a played cue
  // would vanish. Hold a bounded FIFO of ids (preallocated slots) and flush it on resume.
  const pendingCues = Array.from({ length: MAX_PENDING_CUES }, () => ({
    soundId: null as string | null,
    hasPosition: false,
    x: 0,
    y: 0,
    z: 0,
  }));
  let pendingHead = 0;
  let pendingCount = 0;

  function contextRunning(): boolean {
    const state = (context as { state?: AudioContextState }).state;
    return state === undefined || state === "running";
  }

  function queueCue(soundId: string, position: Vec3 | undefined): void {
    let slot;
    if (pendingCount < MAX_PENDING_CUES) {
      slot = pendingCues[(pendingHead + pendingCount) % MAX_PENDING_CUES]!;
      pendingCount += 1;
    } else {
      // Full: drop the oldest cue, which the player has already stopped hearing.
      slot = pendingCues[pendingHead]!;
      pendingHead = (pendingHead + 1) % MAX_PENDING_CUES;
    }
    slot.soundId = soundId;
    slot.hasPosition = position !== undefined;
    slot.x = position?.x ?? 0;
    slot.y = position?.y ?? 0;
    slot.z = position?.z ?? 0;
  }

  /** Play what was held pre-gesture, oldest first, once the context can actually render it. */
  function flushPending(): void {
    while (pendingCount > 0) {
      const slot = pendingCues[pendingHead]!;
      pendingHead = (pendingHead + 1) % MAX_PENDING_CUES;
      pendingCount -= 1;
      const soundId = slot.soundId;
      slot.soundId = null;
      if (soundId === null) continue;
      playInternal(soundId, slot.hasPosition ? { x: slot.x, y: slot.y, z: slot.z } : undefined, false);
    }
  }

  function playCue(soundId: string, position: Vec3 | undefined): void {
    if (disposed) return;
    if (!contextRunning()) {
      queueCue(soundId, position);
      void context.resume().catch(() => undefined);
      return;
    }
    playInternal(soundId, position, false);
  }

  let analyser: AnalyserNode | null = null;
  let analyserSamples: Float32Array<ArrayBuffer> | null = null;
  const level: AudioLevel = { rms: 0, peak: 0 };

  function measure(): AudioLevel {
    if (disposed) {
      level.rms = 0;
      level.peak = 0;
      return level;
    }
    if (analyser === null) {
      try {
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0;
        masterGain.disconnect();
        masterGain.connect(analyser);
        analyser.connect(context.destination);
        analyserSamples = new Float32Array(analyser.fftSize);
      } catch {
        analyser = null;
        level.rms = 0;
        level.peak = 0;
        return level;
      }
    }
    if (analyserSamples === null) {
      level.rms = 0;
      level.peak = 0;
      return level;
    }
    analyser.getFloatTimeDomainData(analyserSamples);
    let sum = 0;
    let peak = 0;
    for (let index = 0; index < analyserSamples.length; index += 1) {
      const sample = analyserSamples[index]!;
      sum += sample * sample;
      const magnitude = Math.abs(sample);
      if (magnitude > peak) peak = magnitude;
    }
    level.rms = Math.sqrt(sum / analyserSamples.length);
    level.peak = Math.min(1, peak);
    return level;
  }

  function playInternal(soundId: string, position: Vec3 | undefined, loop: boolean): AudioEmitterHandle | null {
    if (disposed) return null;
    const sound = sounds[soundId];
    if (sound === undefined || (sound.synth === undefined && sound.url === undefined)) return null;
    const allocation = allocator.request(soundId, sound.priority, sound.maxVoices);
    if (!allocation.ok) return null;
    for (const id of allocation.stolen) activeVoices.get(id)?.();
    const voiceId = allocation.voiceId;
    let bus: GainNode;
    try { bus = busGainNode(sound.bus); } catch { allocator.release(voiceId); return null; }
    const currentPosition = { ...(position ?? listenerPosition) };

    if (sound.synth !== undefined && !loop) {
      applyCueDuck(sound, patchDuration(sound.synth));
      let cueGain: GainNode | null = null;
      let panner: PannerNode | null = null;
      let playback: SynthPlayback | null = null;
      let stopped = false;
      let writtenCueGain = NaN;
      function updateGain(): void {
        if (cueGain === null) return;
        const gain = panner === null
          ? resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1)
          : sound.gain ?? 1;
        if (gain === writtenCueGain) return;
        writtenCueGain = gain;
        cueGain.gain.value = gain;
      }
      function stop(): void {
        if (stopped) return;
        stopped = true;
        activeVoices.delete(voiceId);
        activeSpatialUpdaters.delete(updateGain);
        allocator.release(voiceId);
        playback?.stop();
        cueGain?.disconnect();
        panner?.disconnect();
      }
      activeVoices.set(voiceId, stop);
      try {
        cueGain = context.createGain();
        const spatial = sound.positional === false ? undefined : sound.spatial;
        panner = spatial === undefined ? null : createPanner(context, spatial, currentPosition);
        updateGain();
        cueGain.connect(panner ?? bus);
        panner?.connect(bus);
        playback = realizeSynthPatch(context, cueGain, sharedNoiseBuffer(), sound.synth);
        activeSpatialUpdaters.add(updateGain);
        playback.onEnded(stop);
      } catch {
        stop();
      }
      return null;
    }

    // Everything else resolves to one AudioBuffer we loop/play: sample URL, or a synth patch rendered once.
    let bufferPromise: Promise<AudioBuffer | null>;
    if (sound.synth !== undefined) bufferPromise = renderSynthBuffer(soundId, sound.synth);
    else if (sound.url !== undefined) bufferPromise = loadBuffer(sound.url);
    else return null;

    return playBufferSource(sound, bus, bufferPromise, currentPosition, loop, voiceId);
  }

  function playBufferSource(
    sound: SoundDef,
    bus: GainNode,
    bufferPromise: Promise<AudioBuffer | null>,
    initialPosition: Vec3,
    loop: boolean,
    voiceId: number,
  ): AudioEmitterHandle {
    const disposer = createDisposer();
    let currentPosition = { ...initialPosition };
    let stopped = false;
    const spatial = sound.positional === false ? undefined : sound.spatial;
    // Live control state, applied on source creation so updates that race the async buffer load stick.
    let currentRate = 1;
    let currentUserGain = 1;
    let currentLowpass = MAX_LOOP_CUTOFF;
    let currentHighpass = MIN_LOOP_CUTOFF;
    let currentOcclusion = 0;
    let currentVelocity: Vec3 = { x: 0, y: 0, z: 0 };
    const dopplerFactor = loop ? sound.doppler ?? 0 : 0;
    let sourceNode: AudioBufferSourceNode | null = null;
    let lowpassNode: BiquadFilterNode | null = null;
    let highpassNode: BiquadFilterNode | null = null;
    let userGainNode: GainNode | null = null;
    let falloffGain: GainNode | null = null;
    let pannerNode: PannerNode | null = null;
    // Last value written or scheduled per param: an unchanged emitter writes nothing (#2174).
    let writtenFalloff = NaN;
    let writtenPannerX = NaN;
    let writtenPannerY = NaN;
    let writtenPannerZ = NaN;
    let writtenRate = NaN;
    let writtenGain = NaN;
    let writtenLowpass = NaN;
    let writtenHighpass = NaN;

    function applyOcclusionAmount(amount: number): void {
      const next = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
      if (next === currentOcclusion) return;
      currentOcclusion = next;
      applyUserGain();
      applyLowpass();
    }

    const occlusionTarget: OcclusionTarget = {
      x: initialPosition.x,
      y: initialPosition.y,
      z: initialPosition.z,
      lastTest: -Infinity,
      tested: false,
      set: applyOcclusionAmount,
    };
    if (loop) occlusionTargets.add(occlusionTarget);

    function effectiveRate(): number {
      if (dopplerFactor === 0) return currentRate;
      const shift = dopplerRate(
        [listenerPosition.x, listenerPosition.y, listenerPosition.z],
        [listenerVelocity.x, listenerVelocity.y, listenerVelocity.z],
        [currentPosition.x, currentPosition.y, currentPosition.z],
        [currentVelocity.x, currentVelocity.y, currentVelocity.z],
        { factor: dopplerFactor },
      );
      return clampLoopRate(currentRate * shift);
    }

    function applyRate(): void {
      if (sourceNode === null) return;
      const rate = effectiveRate();
      if (rate === writtenRate) return;
      writtenRate = rate;
      sourceNode.playbackRate.setTargetAtTime(rate, context.currentTime, LOOP_PARAM_SMOOTH_TC);
    }

    /** Player/loop gain composed with occlusion; the game's own gain is never overwritten by it. */
    function effectiveUserGain(): number {
      const blocked = occlusionConfig.attenuation + (1 - occlusionConfig.attenuation) * (1 - currentOcclusion);
      return clampLoopGain(currentUserGain) * blocked;
    }

    function applyUserGain(): void {
      const gain = effectiveUserGain();
      if (gain === writtenGain) return;
      writtenGain = gain;
      if (userGainNode !== null) userGainNode.gain.setTargetAtTime(gain, context.currentTime, LOOP_PARAM_SMOOTH_TC);
    }

    /** Darkest of the game's own cutoff and the occlusion floor, blended by the blocked amount. */
    function effectiveLowpass(): number {
      if (currentOcclusion <= 0) return currentLowpass;
      const floor = Math.min(currentLowpass, occlusionConfig.lowpassHz);
      return currentLowpass - (currentLowpass - floor) * currentOcclusion;
    }

    function applyLowpass(): void {
      const cutoff = clampLoopCutoff(effectiveLowpass(), MAX_LOOP_CUTOFF, nyquist);
      if (cutoff === writtenLowpass) return;
      writtenLowpass = cutoff;
      if (lowpassNode !== null) lowpassNode.frequency.setTargetAtTime(cutoff, context.currentTime, LOOP_PARAM_SMOOTH_TC);
    }

    function updateFalloff(): void {
      if (falloffGain !== null && spatial === undefined) {
        const gain = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
        if (gain !== writtenFalloff) {
          writtenFalloff = gain;
          falloffGain.gain.value = gain;
        }
      }
      if (pannerNode !== null) {
        if (writtenPannerX !== currentPosition.x) {
          writtenPannerX = currentPosition.x;
          setAudioParam(pannerNode.positionX, currentPosition.x);
        }
        if (writtenPannerY !== currentPosition.y) {
          writtenPannerY = currentPosition.y;
          setAudioParam(pannerNode.positionY, currentPosition.y);
        }
        if (writtenPannerZ !== currentPosition.z) {
          writtenPannerZ = currentPosition.z;
          setAudioParam(pannerNode.positionZ, currentPosition.z);
        }
      }
      if (dopplerFactor !== 0) applyRate();
    }

    disposer.onDispose(() => {
      occlusionTargets.delete(occlusionTarget);
      if (sourceNode !== null) sourceNode.onended = null;
      try {
        sourceNode?.stop();
      } catch {
      }
      sourceNode?.disconnect();
      lowpassNode?.disconnect();
      highpassNode?.disconnect();
      userGainNode?.disconnect();
      falloffGain?.disconnect();
      pannerNode?.disconnect();
      sourceNode = null;
      lowpassNode = null;
      highpassNode = null;
      userGainNode = null;
      falloffGain = null;
      pannerNode = null;
    });

    void bufferPromise.then((buffer) => {
      if (stopped || disposed) return;
      if (buffer === null) { handle.stop(); return; }
      if (!loop) applyCueDuck(sound, buffer.duration);
      const src = context.createBufferSource();
      sourceNode = src;
      src.buffer = buffer;
      src.loop = loop || (sound.loop ?? false);
      writtenRate = effectiveRate();
      src.playbackRate.value = writtenRate;
      // Spatial panners own distance attenuation; the scalar stage keeps only authored gain.
      const uGain = context.createGain();
      userGainNode = uGain;
      writtenGain = effectiveUserGain();
      uGain.gain.value = writtenGain;
      const fGain = context.createGain();
      falloffGain = fGain;
      writtenFalloff = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      fGain.gain.value = writtenFalloff;
      if (loop) {
        const lp = context.createBiquadFilter();
        lowpassNode = lp;
        lp.type = "lowpass";
        writtenLowpass = clampLoopCutoff(effectiveLowpass(), MAX_LOOP_CUTOFF, nyquist);
        lp.frequency.value = writtenLowpass;
        const hp = context.createBiquadFilter();
        highpassNode = hp;
        hp.type = "highpass";
        writtenHighpass = clampLoopCutoff(currentHighpass, MIN_LOOP_CUTOFF, nyquist);
        hp.frequency.value = writtenHighpass;
        src.connect(lp);
        lp.connect(hp);
        hp.connect(uGain);
      } else {
        src.connect(uGain);
      }
      uGain.connect(fGain);
      if (spatial !== undefined) {
        const panner = createPanner(context, spatial, currentPosition);
        pannerNode = panner;
        writtenPannerX = currentPosition.x;
        writtenPannerY = currentPosition.y;
        writtenPannerZ = currentPosition.z;
        fGain.gain.value = sound.gain ?? 1;
        fGain.connect(panner);
        panner.connect(bus);
      } else {
        fGain.connect(bus);
      }

      src.onended = () => handle.stop();
      src.start();
    }).catch(() => handle.stop());

    activeSpatialUpdaters.add(updateFalloff);
    if (loop) requestOcclusionTest(occlusionTarget);

    const handle: AudioEmitterHandle = {
      isPlaying: () => !stopped,
      setPosition(next) {
        if (stopped) return;
        currentPosition.x = next.x;
        currentPosition.y = next.y;
        currentPosition.z = next.z;
        occlusionTarget.x = next.x;
        occlusionTarget.y = next.y;
        occlusionTarget.z = next.z;
        updateFalloff();
        if (loop) requestOcclusionTest(occlusionTarget);
      },
      setRate(rate) {
        currentRate = clampLoopRate(rate);
        applyRate();
      },
      setLowpass(hz) {
        currentLowpass = clampLoopCutoff(hz, MAX_LOOP_CUTOFF, nyquist);
        applyLowpass();
      },
      setHighpass(hz) {
        currentHighpass = clampLoopCutoff(hz, MIN_LOOP_CUTOFF, nyquist);
        if (currentHighpass === writtenHighpass) return;
        writtenHighpass = currentHighpass;
        if (highpassNode !== null) highpassNode.frequency.setTargetAtTime(currentHighpass, context.currentTime, LOOP_PARAM_SMOOTH_TC);
      },
      setVelocity(velocity) {
        currentVelocity.x = velocity.x;
        currentVelocity.y = velocity.y;
        currentVelocity.z = velocity.z;
        if (dopplerFactor !== 0) applyRate();
      },
      setGain(gain) {
        currentUserGain = clampLoopGain(gain);
        applyUserGain();
      },
      setOcclusion(amount) {
        applyOcclusionAmount(amount);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        activeSpatialUpdaters.delete(updateFalloff);
        activeVoices.delete(voiceId);
        allocator.release(voiceId);
        disposer.dispose();
      },
    };
    activeVoices.set(voiceId, () => handle.stop());
    return handle;
  }

  return {
    setVoiceLimit(maxTotal, overflow) {
      if (disposed) return;
      for (const id of allocator.retune({ maxTotal, overflow })) activeVoices.get(id)?.();
    },
    setListenerPose(position) {
      if (disposed) return;
      const pose = "position" in position ? position : { position, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
      const positionChanged =
        listenerPosition.x !== pose.position.x ||
        listenerPosition.y !== pose.position.y ||
        listenerPosition.z !== pose.position.z;
      listenerPosition.x = pose.position.x;
      listenerPosition.y = pose.position.y;
      listenerPosition.z = pose.position.z;
      const velocity = "velocity" in pose && pose.velocity !== undefined ? pose.velocity : ZERO_VELOCITY;
      listenerVelocity.x = velocity.x;
      listenerVelocity.y = velocity.y;
      listenerVelocity.z = velocity.z;
      const listener = context.listener;
      if (positionChanged || !ambienceInitialized) {
        ambienceInitialized = true;
        applyAmbience();
      }
      let listenerMoved = writeChanged(listenerWritten, 0, listener.positionX, pose.position.x);
      listenerMoved = writeChanged(listenerWritten, 1, listener.positionY, pose.position.y) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 2, listener.positionZ, pose.position.z) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 3, listener.forwardX, pose.forward.x) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 4, listener.forwardY, pose.forward.y) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 5, listener.forwardZ, pose.forward.z) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 6, listener.upX, pose.up.x) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 7, listener.upY, pose.up.y) || listenerMoved;
      listenerMoved = writeChanged(listenerWritten, 8, listener.upZ, pose.up.z) || listenerMoved;
      // Doppler loops alone read listener velocity, so only a changed velocity needs the per-voice pass.
      let velocityChanged = writeChanged(listenerVelocityWritten, 0, undefined, velocity.x);
      velocityChanged = writeChanged(listenerVelocityWritten, 1, undefined, velocity.y) || velocityChanged;
      velocityChanged = writeChanged(listenerVelocityWritten, 2, undefined, velocity.z) || velocityChanged;
      if (positionChanged) stepOcclusion();
      if (!listenerMoved && !velocityChanged) return;
      for (const updateGain of activeSpatialUpdaters) updateGain();
    },
    play(soundId, position) {
      playCue(soundId, position);
    },
    playOneShot(soundId, position) {
      playCue(soundId, position);
    },
    playLoop(soundId, position) {
      return playInternal(soundId, position, true);
    },
    playMusic(themeId, options) {
      if (disposed) return;
      void context.resume().catch(() => undefined);
      musicDirector()?.crossfadeTo(themeId, options);
    },
    setOcclusionSource(blocked) {
      if (disposed) return;
      occlusionBlocked = blocked;
      if (blocked === null) {
        for (const target of occlusionTargets) target.set(0);
        return;
      }
      stepOcclusion();
    },
    occlusionStats() {
      const { tests, blocked, testMs, lastTest } = occlusionStatsState;
      return { tests, blocked, testMs, perTestMs: tests > 0 ? testMs / tests : 0, lastTest };
    },
    ambience() {
      const levels: { id: string; level: number }[] = [];
      for (const zone of zones) {
        const weight = zoneWeight(zone.id);
        if (weight > 0) levels.push({ id: zone.id, level: weight * (zone.gain ?? 1) });
      }
      return { zone: ambienceActive, levels };
    },
    duck: duckBus,
    setBusGain(busId, gain) {
      if (disposed) return;
      busMixOf(busId).gain = gain;
      applyBus(busId);
    },
    setBusMute(busId, muted) {
      if (disposed) return;
      busMixOf(busId).muted = muted;
      applyBus(busId);
    },
    setMasterGain(gain) {
      if (disposed) return;
      masterVolume = gain;
      applyMaster();
    },
    setMasterMute(muted) {
      if (disposed) return;
      masterMuted = muted;
      applyMaster();
    },
    masterLevel,
    busLevel,
    measure,
    resume() {
      if (disposed) return;
      void context.resume().then(() => {
        if (!disposed && contextRunning()) flushPending();
      }).catch(() => undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of [...activeVoices.values()]) stop();
      activeSpatialUpdaters.clear();
      occlusionTargets.clear();
      for (const bed of zoneBeds.values()) {
        try {
          bed.source?.stop();
        } catch {
        }
        bed.source?.disconnect();
        bed.gain.disconnect();
      }
      zoneBeds.clear();
      for (const holds of duckHolds.values()) {
        for (const hold of holds) {
          if (hold.timer !== undefined) clearTimeout(hold.timer);
        }
      }
      duckHolds.clear();
      director?.dispose();
      for (const node of busGains.values()) node.disconnect();
      busGains.clear();
      masterGain.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
