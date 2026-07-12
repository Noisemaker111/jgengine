import type { NoiseVoice, SynthPatch, ToneVoice } from "@jgengine/core/audio/synth";

/** Build the shared 1-second mono white-noise buffer every noise voice samples from. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

function realizeTone(ctx: BaseAudioContext, out: AudioNode, voice: ToneVoice, cueGain: number, at: number): void {
  const t = at + (voice.delay ?? 0);
  const peak = (voice.gain ?? 1) * cueGain;
  const attack = voice.attack ?? 0.012;
  const osc = ctx.createOscillator();
  osc.type = voice.wave ?? "sine";
  osc.frequency.setValueAtTime(voice.freq, t);
  if (voice.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.slideTo), t + voice.duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + voice.duration);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + voice.duration + 0.05);
}

function realizeNoise(
  ctx: BaseAudioContext,
  out: AudioNode,
  noiseBuf: AudioBuffer,
  voice: NoiseVoice,
  cueGain: number,
  at: number,
): void {
  const t = at + (voice.delay ?? 0);
  const peak = (voice.gain ?? 1) * cueGain;
  const decay = voice.decay ?? 0.9;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = voice.filterType ?? "lowpass";
  filter.frequency.value = voice.filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + voice.duration * decay);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 0.5, voice.duration);
}

/**
 * Realise a procedural cue on Web Audio: every voice is scheduled at
 * `ctx.currentTime + delay` into `out`, summed into one one-shot. `noiseBuf` is
 * the shared buffer from {@link createNoiseBuffer}.
 */
export function realizeSynthPatch(ctx: BaseAudioContext, out: AudioNode, noiseBuf: AudioBuffer, patch: SynthPatch): void {
  const cueGain = patch.gain ?? 1;
  const at = ctx.currentTime;
  for (const voice of patch.voices) {
    if (voice.kind === "tone") realizeTone(ctx, out, voice, cueGain, at);
    else realizeNoise(ctx, out, noiseBuf, voice, cueGain, at);
  }
}
