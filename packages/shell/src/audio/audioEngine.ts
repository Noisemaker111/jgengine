import { distance3, resolveEmitterGain, type AudioBusDef, type SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { MusicTheme } from "@jgengine/core/audio/music";
import { patchDuration, type SynthPatch } from "@jgengine/core/audio/synth";
import { createDisposer } from "@jgengine/core/game/defineGame";

import { clampLoopGain, clampLoopRate } from "./loopParams";
import { MusicDirector, type CrossfadeOptions } from "./musicDirector";
import { createNoiseBuffer, realizeSynthPatch } from "./synthEngine";

/** setTargetAtTime time constant (~20 ms) for zipper-free live rate/gain ramps on retained loops (#1051). */
const LOOP_PARAM_SMOOTH_TC = 0.02;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AudioSceneConfig {
  sounds?: Record<string, SoundDef>;
  buses?: Record<string, AudioBusDef>;
  /** Procedural music themes, crossfaded by {@link AudioEngine.playMusic}. Mixed through the `musicBus` (default "music") so the settings volume applies. */
  music?: Record<string, MusicTheme>;
  /** Bus id the procedural music director mixes through. Default "music". */
  musicBus?: string;
}

export interface AudioEmitterHandle {
  setPosition(position: Vec3): void;
  /** Live pitch of a retained loop: `rate` multiplies the authored playback rate (1 = authored), clamped to 0.25–4 and ramped ~20 ms to avoid zipper noise (#1051). */
  setRate(rate: number): void;
  /** Live volume of a retained loop: `gain` scales the source (0–1), clamped and ramped ~20 ms (#1051). */
  setGain(gain: number): void;
  stop(): void;
}

export interface AudioEngine {
  setListenerPose(position: Vec3): void;
  playOneShot(soundId: string, position?: Vec3): void;
  playLoop(soundId: string, position?: Vec3): AudioEmitterHandle | null;
  /** Crossfade the procedural soundtrack to `themeId` (null fades out). No-op when no `music` catalog is configured. */
  playMusic(themeId: string | null, options?: CrossfadeOptions): void;
  setBusGain(busId: string, gain: number): void;
  setMasterGain(gain: number): void;
  resume(): void;
  dispose(): void;
}

function createNoopEngine(): AudioEngine {
  return {
    setListenerPose: () => undefined,
    playOneShot: () => undefined,
    playLoop: () => null,
    playMusic: () => undefined,
    setBusGain: () => undefined,
    setMasterGain: () => undefined,
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

export function createAudioEngine(config: AudioSceneConfig = {}): AudioEngine {
  const sounds = config.sounds ?? {};
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
  function busGainNode(busId: string): GainNode {
    let node = busGains.get(busId);
    if (node === undefined) {
      node = context.createGain();
      node.gain.value = busDefs[busId]?.gain ?? 1;
      node.connect(masterGain);
      busGains.set(busId, node);
    }
    return node;
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
  const activeSpatialUpdaters = new Set<() => void>();
  const activeLoops = new Set<AudioEmitterHandle>();

  const NOOP_HANDLE: AudioEmitterHandle = {
    setPosition: () => undefined,
    setRate: () => undefined,
    setGain: () => undefined,
    stop: () => undefined,
  };

  function playInternal(soundId: string, position: Vec3 | undefined, loop: boolean): AudioEmitterHandle | null {
    const sound = sounds[soundId];
    if (sound === undefined) return null;
    const bus = busGainNode(sound.bus);
    const currentPosition = position ?? listenerPosition;

    // A one-shot synth cue realises its decaying voices live and is fire-and-forget.
    if (sound.synth !== undefined && !loop) {
      const cueGain = context.createGain();
      cueGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      cueGain.connect(bus);
      realizeSynthPatch(context, cueGain, sharedNoiseBuffer(), sound.synth);
      return NOOP_HANDLE;
    }

    // Everything else resolves to one AudioBuffer we loop/play: sample URL, or a synth patch rendered once.
    let bufferPromise: Promise<AudioBuffer | null>;
    if (sound.synth !== undefined) bufferPromise = renderSynthBuffer(soundId, sound.synth);
    else if (sound.url !== undefined) bufferPromise = loadBuffer(sound.url);
    else return null;

    return playBufferSource(sound, bus, bufferPromise, currentPosition, loop);
  }

  function playBufferSource(
    sound: SoundDef,
    bus: GainNode,
    bufferPromise: Promise<AudioBuffer | null>,
    initialPosition: Vec3,
    loop: boolean,
  ): AudioEmitterHandle {
    const disposer = createDisposer();
    let currentPosition = initialPosition;
    // Live control state, applied on source creation so updates that race the async buffer load stick.
    let currentRate = 1;
    let currentUserGain = 1;
    let sourceNode: AudioBufferSourceNode | null = null;
    let userGainNode: GainNode | null = null;
    let falloffGain: GainNode | null = null;

    function updateFalloff(): void {
      if (falloffGain !== null) {
        falloffGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      }
    }

    void bufferPromise.then((buffer) => {
      if (buffer === null) return;
      const src = context.createBufferSource();
      src.buffer = buffer;
      src.loop = loop || (sound.loop ?? false);
      src.playbackRate.value = currentRate;
      // source → per-loop user gain (setGain) → distance falloff → bus
      const uGain = context.createGain();
      uGain.gain.value = currentUserGain;
      const fGain = context.createGain();
      fGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      src.connect(uGain);
      uGain.connect(fGain);
      fGain.connect(bus);
      src.start();
      sourceNode = src;
      userGainNode = uGain;
      falloffGain = fGain;
      disposer.onDispose(() => {
        try {
          src.stop();
        } catch {
        }
        src.disconnect();
        uGain.disconnect();
        fGain.disconnect();
        sourceNode = null;
        userGainNode = null;
        falloffGain = null;
      });
    });

    if (loop) activeSpatialUpdaters.add(updateFalloff);

    const handle: AudioEmitterHandle = {
      setPosition(next) {
        currentPosition = next;
        updateFalloff();
      },
      setRate(rate) {
        currentRate = clampLoopRate(rate);
        if (sourceNode !== null) sourceNode.playbackRate.setTargetAtTime(currentRate, context.currentTime, LOOP_PARAM_SMOOTH_TC);
      },
      setGain(gain) {
        currentUserGain = clampLoopGain(gain);
        if (userGainNode !== null) userGainNode.gain.setTargetAtTime(currentUserGain, context.currentTime, LOOP_PARAM_SMOOTH_TC);
      },
      stop() {
        activeSpatialUpdaters.delete(updateFalloff);
        activeLoops.delete(handle);
        disposer.dispose();
      },
    };
    if (loop) activeLoops.add(handle);
    return handle;
  }

  return {
    setListenerPose(position) {
      listenerPosition = position;
      for (const updateGain of activeSpatialUpdaters) updateGain();
    },
    playOneShot(soundId, position) {
      void context.resume().catch(() => undefined);
      playInternal(soundId, position, false);
    },
    playLoop(soundId, position) {
      return playInternal(soundId, position, true);
    },
    playMusic(themeId, options) {
      void context.resume().catch(() => undefined);
      musicDirector()?.crossfadeTo(themeId, options);
    },
    setBusGain(busId, gain) {
      busGainNode(busId).gain.value = gain;
    },
    setMasterGain(gain) {
      masterGain.gain.value = gain;
    },
    resume() {
      void context.resume().catch(() => undefined);
    },
    dispose() {
      for (const handle of [...activeLoops]) handle.stop();
      activeSpatialUpdaters.clear();
      director?.dispose();
      void context.close().catch(() => undefined);
    },
  };
}
