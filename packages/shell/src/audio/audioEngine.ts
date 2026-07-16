import { distance3, resolveEmitterGain, type AudioBusDef, type SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { MusicTheme } from "@jgengine/core/audio/music";
import { createDisposer } from "@jgengine/core/game/defineGame";

import { MusicDirector, type CrossfadeOptions } from "./musicDirector";
import { createNoiseBuffer, realizeSynthPatch } from "./synthEngine";

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

  let listenerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  const activeSpatialUpdaters = new Set<() => void>();

  function playInternal(soundId: string, position: Vec3 | undefined, loop: boolean): AudioEmitterHandle | null {
    const sound = sounds[soundId];
    if (sound === undefined) return null;
    const bus = busGainNode(sound.bus);
    let currentPosition = position ?? listenerPosition;

    if (sound.synth !== undefined) {
      const cueGain = context.createGain();
      cueGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      cueGain.connect(bus);
      realizeSynthPatch(context, cueGain, sharedNoiseBuffer(), sound.synth);
      return { setPosition: () => undefined, stop: () => undefined };
    }
    if (sound.url === undefined) return null;

    const disposer = createDisposer();
    let liveGain: GainNode | null = null;
    function updateGain(): void {
      if (liveGain !== null) {
        liveGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      }
    }

    void loadBuffer(sound.url).then((buffer) => {
      if (buffer === null) return;
      const sourceNode = context.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.loop = loop || (sound.loop ?? false);
      const gainNode = context.createGain();
      gainNode.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      sourceNode.connect(gainNode);
      gainNode.connect(bus);
      sourceNode.start();
      liveGain = gainNode;
      disposer.onDispose(() => {
        try {
          sourceNode.stop();
        } catch {
        }
        sourceNode.disconnect();
        gainNode.disconnect();
        liveGain = null;
      });
    });

    if (loop) activeSpatialUpdaters.add(updateGain);

    return {
      setPosition(next) {
        currentPosition = next;
        updateGain();
      },
      stop() {
        activeSpatialUpdaters.delete(updateGain);
        disposer.dispose();
      },
    };
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
      activeSpatialUpdaters.clear();
      director?.dispose();
      void context.close().catch(() => undefined);
    },
  };
}
