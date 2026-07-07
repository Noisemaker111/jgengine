import { distance3, resolveEmitterGain, type AudioBusDef, type SoundDef } from "@jgengine/core/audio/audioFalloff";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AudioSceneConfig {
  sounds?: Record<string, SoundDef>;
  buses?: Record<string, AudioBusDef>;
}

export interface AudioEmitterHandle {
  setPosition(position: Vec3): void;
  stop(): void;
}

export interface AudioEngine {
  setListenerPose(position: Vec3): void;
  playOneShot(soundId: string, position?: Vec3): void;
  playLoop(soundId: string, position?: Vec3): AudioEmitterHandle | null;
  setBusGain(busId: string, gain: number): void;
  resume(): void;
  dispose(): void;
}

function createNoopEngine(): AudioEngine {
  return {
    setListenerPose: () => undefined,
    playOneShot: () => undefined,
    playLoop: () => null,
    setBusGain: () => undefined,
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

  function playInternal(soundId: string, position: Vec3 | undefined, loop: boolean): AudioEmitterHandle | null {
    const sound = sounds[soundId];
    if (sound === undefined) return null;
    const bus = busGainNode(sound.bus);
    let currentPosition = position ?? listenerPosition;
    let gainNode: GainNode | null = null;
    let stopped = false;

    void loadBuffer(sound.url).then((buffer) => {
      if (stopped || buffer === null) return;
      const sourceNode = context.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.loop = loop || (sound.loop ?? false);
      gainNode = context.createGain();
      gainNode.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      sourceNode.connect(gainNode);
      gainNode.connect(bus);
      sourceNode.start();
    });

    return {
      setPosition(next) {
        currentPosition = next;
        if (gainNode !== null) {
          gainNode.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
        }
      },
      stop() {
        stopped = true;
      },
    };
  }

  return {
    setListenerPose(position) {
      listenerPosition = position;
    },
    playOneShot(soundId, position) {
      playInternal(soundId, position, false);
    },
    playLoop(soundId, position) {
      return playInternal(soundId, position, true);
    },
    setBusGain(busId, gain) {
      busGainNode(busId).gain.value = gain;
    },
    resume() {
      void context.resume().catch(() => undefined);
    },
    dispose() {
      void context.close().catch(() => undefined);
    },
  };
}
