import type { NoiseVoice, SynthPatch, ToneVoice } from "@jgengine/core/audio/synth";

/** Build the shared 1-second mono white-noise buffer every noise voice samples from. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

function realizeTone(ctx: BaseAudioContext, out: AudioNode, voice: ToneVoice, cueGain: number, at: number, ended: () => void): () => void {
  const t = at + (voice.delay ?? 0);
  const peak = (voice.gain ?? 1) * cueGain;
  const attack = voice.attack ?? 0.012;
  const osc = ctx.createOscillator();
  const nodes: AudioNode[] = [];
  const stop = trackVoice(osc, nodes, ended);
  try {
    osc.type = voice.wave ?? "sine";
    osc.frequency.setValueAtTime(voice.freq, t);
    if (voice.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.slideTo), t + voice.duration);
    const sustainEnd = Math.max(attack, voice.sustain ?? 0);
    const g = ctx.createGain();
    nodes.push(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (sustainEnd > attack) g.gain.setValueAtTime(peak, t + sustainEnd);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(voice.duration, sustainEnd + 0.001));
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + voice.duration + 0.05);
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}

function realizeNoise(
  ctx: BaseAudioContext,
  out: AudioNode,
  noiseBuf: AudioBuffer,
  voice: NoiseVoice,
  cueGain: number,
  at: number,
  ended: () => void,
): () => void {
  const t = at + (voice.delay ?? 0);
  const peak = (voice.gain ?? 1) * cueGain;
  const decay = voice.decay ?? 0.9;
  const src = ctx.createBufferSource();
  const nodes: AudioNode[] = [];
  const stop = trackVoice(src, nodes, ended);
  try {
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    // Loop the shared 1-second buffer so a random offset cannot truncate a longer voice.
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    nodes.push(filter);
    filter.type = voice.filterType ?? "lowpass";
    filter.frequency.value = voice.filterFreq;
    const sustain = Math.max(0, voice.sustain ?? 0);
    const g = ctx.createGain();
    nodes.push(g);
    g.gain.setValueAtTime(peak, t);
    if (sustain > 0) g.gain.setValueAtTime(peak, t + sustain);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(voice.duration * decay, sustain + 0.001));
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5, voice.duration);
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}

function trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[], ended: () => void): () => void {
  let disposed = false;
  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    source.onended = null;
    source.disconnect();
    for (const node of nodes) node.disconnect();
    ended();
  }
  source.onended = cleanup;
  return () => {
    if (disposed) return;
    try { source.stop(); } catch { }
    cleanup();
  };
}

/** Scheduled procedural sources; stopping releases their source/filter/envelope graph. */
export interface SynthPlayback {
  stop(): void;
  /** Called once after every source ends; late subscribers are notified immediately. */
  onEnded(callback: () => void): void;
}

/**
 * Realise a procedural cue on Web Audio: every voice is scheduled at
 * `ctx.currentTime + delay` into `out`, summed into one one-shot. `noiseBuf` is
 * the shared buffer from {@link createNoiseBuffer}.
 */
export function realizeSynthPatch(ctx: BaseAudioContext, out: AudioNode, noiseBuf: AudioBuffer, patch: SynthPatch): SynthPlayback {
  const cueGain = patch.gain ?? 1;
  const at = ctx.currentTime;
  let remaining = patch.voices.length;
  const callbacks: (() => void)[] = [];
  const stops: (() => void)[] = [];
  function ended(): void {
    remaining -= 1;
    if (remaining === 0) for (const callback of callbacks.splice(0)) callback();
  }
  try {
    for (const voice of patch.voices) {
      stops.push(voice.kind === "tone"
        ? realizeTone(ctx, out, voice, cueGain, at, ended)
        : realizeNoise(ctx, out, noiseBuf, voice, cueGain, at, ended));
    }
  } catch (error) {
    for (const stop of stops) stop();
    throw error;
  }
  return {
    stop() { for (const stop of stops) stop(); },
    onEnded(callback) { if (remaining === 0) callback(); else callbacks.push(callback); },
  };
}
