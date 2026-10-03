import { distance3, resolveEmitterGain, type AudioBusDef, type SoundDef } from "@jgengine/core/audio/audioFalloff";
import { dopplerRate } from "@jgengine/core/audio/doppler";
import type { MusicTheme } from "@jgengine/core/audio/music";
import { patchDuration, type SynthPatch } from "@jgengine/core/audio/synth";
import { createVoiceAllocator, type VoiceAllocator, type VoiceAllocatorConfig } from "@jgengine/core/audio/voiceAllocator";
import { createDisposer } from "@jgengine/core/game/defineGame";

import { clampLoopCutoff, clampLoopGain, clampLoopRate, MIN_LOOP_CUTOFF, MAX_LOOP_CUTOFF } from "./loopParams";
import { MusicDirector, type CrossfadeOptions } from "./musicDirector";
import { createNoiseBuffer, realizeSynthPatch, type SynthPlayback } from "./synthEngine";

/** setTargetAtTime time constant (~20 ms) for zipper-free live rate/gain ramps on retained loops (#1051). */
const LOOP_PARAM_SMOOTH_TC = 0.02;

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
  stop(): void;
}

export interface AudioEngine {
  /** Full listener orientation, or a legacy position using forward -Z and up +Y. */
  setListenerPose(pose: ListenerPose | Vec3): void;
  /** Retune the SFX budget and optional admission policy, stopping the lowest-priority oldest voices first. */
  setVoiceLimit(maxTotal: number, overflow?: VoiceAllocatorConfig["overflow"]): void;
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
    setVoiceLimit: () => undefined,
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
  function busGainNode(busId: string): GainNode {
    let node = busGains.get(busId);
    if (node === undefined) {
      node = context.createGain();
      try {
        node.gain.value = busDefs[busId]?.gain ?? 1;
        node.connect(masterGain);
        busGains.set(busId, node);
      } catch (error) {
        node.disconnect();
        throw error;
      }
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
  let listenerVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  const nyquist = context.sampleRate / 2;
  const activeSpatialUpdaters = new Set<() => void>();

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
      let cueGain: GainNode | null = null;
      let panner: PannerNode | null = null;
      let playback: SynthPlayback | null = null;
      let stopped = false;
      function updateGain(): void {
        if (cueGain === null) return;
        cueGain.gain.value = panner === null
          ? resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1)
          : sound.gain ?? 1;
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
    let currentVelocity: Vec3 = { x: 0, y: 0, z: 0 };
    const dopplerFactor = loop ? sound.doppler ?? 0 : 0;
    let sourceNode: AudioBufferSourceNode | null = null;
    let lowpassNode: BiquadFilterNode | null = null;
    let highpassNode: BiquadFilterNode | null = null;
    let userGainNode: GainNode | null = null;
    let falloffGain: GainNode | null = null;
    let pannerNode: PannerNode | null = null;

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
      if (sourceNode !== null) sourceNode.playbackRate.setTargetAtTime(effectiveRate(), context.currentTime, LOOP_PARAM_SMOOTH_TC);
    }

    function updateFalloff(): void {
      if (falloffGain !== null && spatial === undefined) {
        falloffGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      }
      if (pannerNode !== null) setPannerPosition(pannerNode, currentPosition);
      if (dopplerFactor !== 0) applyRate();
    }

    disposer.onDispose(() => {
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
      const src = context.createBufferSource();
      sourceNode = src;
      src.buffer = buffer;
      src.loop = loop || (sound.loop ?? false);
      src.playbackRate.value = effectiveRate();
      // Spatial panners own distance attenuation; the scalar stage keeps only authored gain.
      const uGain = context.createGain();
      userGainNode = uGain;
      uGain.gain.value = currentUserGain;
      const fGain = context.createGain();
      falloffGain = fGain;
      fGain.gain.value = resolveEmitterGain(distance3(currentPosition, listenerPosition), sound, 1);
      if (loop) {
        const lp = context.createBiquadFilter();
        lowpassNode = lp;
        lp.type = "lowpass";
        lp.frequency.value = clampLoopCutoff(currentLowpass, MAX_LOOP_CUTOFF, nyquist);
        const hp = context.createBiquadFilter();
        highpassNode = hp;
        hp.type = "highpass";
        hp.frequency.value = clampLoopCutoff(currentHighpass, MIN_LOOP_CUTOFF, nyquist);
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

    const handle: AudioEmitterHandle = {
      isPlaying: () => !stopped,
      setPosition(next) {
        if (stopped) return;
        currentPosition = { ...next };
        updateFalloff();
      },
      setRate(rate) {
        currentRate = clampLoopRate(rate);
        applyRate();
      },
      setLowpass(hz) {
        currentLowpass = clampLoopCutoff(hz, MAX_LOOP_CUTOFF, nyquist);
        if (lowpassNode !== null) lowpassNode.frequency.setTargetAtTime(currentLowpass, context.currentTime, LOOP_PARAM_SMOOTH_TC);
      },
      setHighpass(hz) {
        currentHighpass = clampLoopCutoff(hz, MIN_LOOP_CUTOFF, nyquist);
        if (highpassNode !== null) highpassNode.frequency.setTargetAtTime(currentHighpass, context.currentTime, LOOP_PARAM_SMOOTH_TC);
      },
      setVelocity(velocity) {
        currentVelocity = { ...velocity };
        if (dopplerFactor !== 0) applyRate();
      },
      setGain(gain) {
        currentUserGain = clampLoopGain(gain);
        if (userGainNode !== null) userGainNode.gain.setTargetAtTime(currentUserGain, context.currentTime, LOOP_PARAM_SMOOTH_TC);
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
      listenerPosition = { ...pose.position };
      listenerVelocity = "velocity" in pose && pose.velocity !== undefined ? { ...pose.velocity } : ZERO_VELOCITY;
      const listener = context.listener;
      setAudioParam(listener.positionX, pose.position.x);
      setAudioParam(listener.positionY, pose.position.y);
      setAudioParam(listener.positionZ, pose.position.z);
      setAudioParam(listener.forwardX, pose.forward.x);
      setAudioParam(listener.forwardY, pose.forward.y);
      setAudioParam(listener.forwardZ, pose.forward.z);
      setAudioParam(listener.upX, pose.up.x);
      setAudioParam(listener.upY, pose.up.y);
      setAudioParam(listener.upZ, pose.up.z);
      for (const updateGain of activeSpatialUpdaters) updateGain();
    },
    playOneShot(soundId, position) {
      if (disposed) return;
      void context.resume().catch(() => undefined);
      playInternal(soundId, position, false);
    },
    playLoop(soundId, position) {
      return playInternal(soundId, position, true);
    },
    playMusic(themeId, options) {
      if (disposed) return;
      void context.resume().catch(() => undefined);
      musicDirector()?.crossfadeTo(themeId, options);
    },
    setBusGain(busId, gain) {
      if (disposed) return;
      busGainNode(busId).gain.value = gain;
    },
    setMasterGain(gain) {
      if (disposed) return;
      masterGain.gain.value = gain;
    },
    resume() {
      if (disposed) return;
      void context.resume().catch(() => undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of [...activeVoices.values()]) stop();
      activeSpatialUpdaters.clear();
      director?.dispose();
      for (const node of busGains.values()) node.disconnect();
      busGains.clear();
      masterGain.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
