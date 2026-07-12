import { mtof, type MusicInstrument, type NoteEvent } from "@jgengine/core/audio/music";

type Ctx = BaseAudioContext;

function adsr(ctx: Ctx, when: number, dur: number, peak: number, attack: number, release: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.setValueAtTime(peak, Math.max(when + attack, when + dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);
  return g;
}

function stack(ctx: Ctx, when: number, freq: number, dur: number, out: AudioNode, type: OscillatorType, dets: number[], tail: number): void {
  for (const det of dets) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = det;
    o.connect(out);
    o.start(when);
    o.stop(when + dur + tail);
  }
}

function strings(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode, attack = 0.3): void {
  const g = adsr(ctx, when, dur, vel * 0.16, attack, 0.7);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 750 + freq * 2;
  lp.connect(g).connect(out);
  stack(ctx, when, freq, dur, lp, "sawtooth", [-6, 5], 0.9);
}

function pad(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.11, 0.6, 1.1);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520 + freq * 1.4;
  lp.connect(g).connect(out);
  stack(ctx, when, freq, dur, lp, "sawtooth", [-9, -3, 4, 10], 1.2);
}

function reed(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.14, 0.08, 0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1600 + freq;
  lp.connect(g).connect(out);
  stack(ctx, when, freq, dur, lp, "sawtooth", [-3, 4], 0.35);
}

function horn(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.15, 0.09, 0.3);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900 + freq * 1.5;
  lp.Q.value = 0.6;
  lp.connect(g).connect(out);
  stack(ctx, when, freq, dur, lp, "sawtooth", [-4, 3], 0.4);
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = freq;
  const sg = ctx.createGain();
  sg.gain.value = 0.4;
  sub.connect(sg).connect(lp);
  sub.start(when);
  sub.stop(when + dur + 0.4);
}

function brassStab(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, Math.min(dur, 0.4), vel * 0.17, 0.02, 0.14);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400 + freq * 2;
  lp.connect(g).connect(out);
  stack(ctx, when, freq, Math.min(dur, 0.4), lp, "sawtooth", [-5, 6], 0.2);
}

function flute(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.15, 0.06, 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  lp.connect(g).connect(out);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  o.connect(lp);
  o.start(when);
  o.stop(when + dur + 0.25);
  const breath = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * Math.min(dur, 0.4));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
  breath.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 2;
  const bg = ctx.createGain();
  bg.gain.value = vel * 0.02;
  breath.connect(bp).connect(bg).connect(out);
  breath.start(when);
}

function pipe(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.13, 0.03, 0.15);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3000;
  lp.connect(g).connect(out);
  stack(ctx, when, freq, dur, lp, "triangle", [0, 7], 0.2);
}

function squareLead(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.1, 0.02, 0.12);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200 + freq;
  lp.connect(g).connect(out);
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.value = freq;
  o.connect(lp);
  o.start(when);
  o.stop(when + dur + 0.2);
}

function choir(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.12, 0.25, 0.6);
  const formant = ctx.createBiquadFilter();
  formant.type = "bandpass";
  formant.frequency.value = Math.min(1800, 500 + freq * 1.6);
  formant.Q.value = 0.7;
  formant.connect(g).connect(out);
  stack(ctx, when, freq, dur, formant, "sawtooth", [-8, -2, 6], 0.8);
  stack(ctx, when, freq * 2, dur, formant, "triangle", [3], 0.8);
}

function oboe(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const g = adsr(ctx, when, dur, vel * 0.17, 0.055, 0.22);
  const formant = ctx.createBiquadFilter();
  formant.type = "bandpass";
  formant.frequency.value = Math.min(2400, 600 + freq * 2.2);
  formant.Q.value = 0.9;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2800;
  formant.connect(lp).connect(g).connect(out);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibGain = ctx.createGain();
  vibGain.gain.setValueAtTime(0, when);
  vibGain.gain.linearRampToValueAtTime(freq * 0.004, when + 0.3);
  vib.connect(vibGain);
  for (const det of [-5, 4]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = det;
    vibGain.connect(o.frequency);
    o.connect(formant);
    o.start(when);
    o.stop(when + dur + 0.4);
  }
  vib.start(when);
  vib.stop(when + dur + 0.4);
}

function pluck(ctx: Ctx, when: number, freq: number, vel: number, out: GainNode, decay: number, bassy = false): void {
  const g = ctx.createGain();
  const peak = vel * (bassy ? 0.26 : 0.2);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = bassy ? 900 : 2600 + freq;
  lp.connect(g).connect(out);
  const o = ctx.createOscillator();
  o.type = bassy ? "triangle" : "sawtooth";
  o.frequency.value = freq;
  o.connect(lp);
  o.start(when);
  o.stop(when + decay + 0.1);
  if (!bassy) {
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2.001;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(peak * 0.4, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + decay * 0.6);
    o2.connect(g2).connect(out);
    o2.start(when);
    o2.stop(when + decay);
  }
}

function bell(ctx: Ctx, when: number, freq: number, vel: number, out: GainNode, decay = 1.8): void {
  for (const [ratio, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]] as const) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel * 0.14 * amp, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay * (1 - (ratio - 1) * 0.06));
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * ratio;
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + decay + 0.2);
  }
}

function piano(ctx: Ctx, when: number, freq: number, dur: number, vel: number, out: GainNode): void {
  const naturalDecay = Math.min(5.2, Math.max(1.2, 380 / freq));
  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = Math.min(5600, 1400 + freq * 4);
  body.Q.value = 0.35;
  body.connect(out);
  const partials: ReadonlyArray<readonly [number, number, number, number]> = [
    [1, 0.62, 1, -3],
    [1.0005, 0.62, 1, 3],
    [2.003, 0.5, 0.58, 2],
    [3.006, 0.2, 0.36, -4],
    [4.012, 0.09, 0.24, 5],
    [5.02, 0.05, 0.17, -6],
    [7.03, 0.025, 0.12, 4],
  ];
  for (const [ratio, amp, decayMul, cents] of partials) {
    const decay = Math.min(naturalDecay * decayMul, dur + 0.35);
    const g = ctx.createGain();
    const peak = vel * 0.24 * amp;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.14, decay));
    const o = ctx.createOscillator();
    o.type = ratio < 1.01 ? "triangle" : "sine";
    o.frequency.value = freq * ratio;
    o.detune.value = cents;
    o.connect(g).connect(body);
    o.start(when);
    o.stop(when + Math.max(0.14, decay) + 0.1);
  }
}

function noiseHit(ctx: Ctx, when: number, vel: number, out: GainNode, hp: number, len: number, curve: number): void {
  const n = Math.floor(ctx.sampleRate * len);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** curve;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.22, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + len);
  src.connect(f).connect(g).connect(out);
  src.start(when);
}

function drum(ctx: Ctx, when: number, freq: number, vel: number, out: GainNode, decay: number, punch: number): void {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq * punch, when);
  o.frequency.exponentialRampToValueAtTime(freq, when + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.5, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  o.connect(g).connect(out);
  o.start(when);
  o.stop(when + decay + 0.05);
  noiseHit(ctx, when, vel * 0.4, out, 200, Math.min(decay, 0.12), 2);
}

function woodBlock(ctx: Ctx, when: number, vel: number, out: GainNode): void {
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.value = 1100;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.2, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1100;
  o.connect(bp).connect(g).connect(out);
  o.start(when);
  o.stop(when + 0.07);
}

function cymSwell(ctx: Ctx, when: number, dur: number, vel: number, out: GainNode): void {
  const n = Math.floor(ctx.sampleRate * (dur + 0.3));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vel * 0.1, when + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.3);
  src.connect(hp).connect(g).connect(out);
  src.start(when);
}

/**
 * Play one theme note through its instrument voice into `out` (a per-layer gain
 * node the director wires to master + reverb). `spb` is seconds-per-beat and
 * `transpose` shifts the note in semitones for per-zone key changes. This is the
 * engine's reusable instrument library; unknown instruments fall back to a sine.
 */
export function playMusicNote(ctx: Ctx, event: NoteEvent, when: number, spb: number, out: GainNode, transpose = 0): void {
  const freq = mtof(event.midi + transpose);
  const dur = Math.max(0.1, event.dur * spb);
  const vel = event.vel;
  const inst: MusicInstrument = event.inst;
  switch (inst) {
    case "strings": return strings(ctx, when, freq, dur, vel, out);
    case "stacc": return strings(ctx, when, freq, Math.min(dur, 0.22), vel, out, 0.02);
    case "pad": return pad(ctx, when, freq, dur, vel, out);
    case "reed": return reed(ctx, when, freq, dur, vel, out);
    case "horn": return horn(ctx, when, freq, dur, vel, out);
    case "brassStab": return brassStab(ctx, when, freq, dur, vel, out);
    case "flute": return flute(ctx, when, freq, dur, vel, out);
    case "pipe": return pipe(ctx, when, freq, dur, vel, out);
    case "squareLead": return squareLead(ctx, when, freq, dur, vel, out);
    case "choir": return choir(ctx, when, freq, dur, vel, out);
    case "oboe": return oboe(ctx, when, freq, dur, vel, out);
    case "harp": return pluck(ctx, when, freq, vel, out, 1.4);
    case "lute": return pluck(ctx, when, freq, vel, out, 0.7);
    case "dulcimer": return pluck(ctx, when, freq, vel, out, 1.0);
    case "bass": return pluck(ctx, when, freq, vel, out, 0.9, true);
    case "bell": return bell(ctx, when, freq, vel, out);
    case "tinyBell": return bell(ctx, when, freq, vel, out, 0.7);
    case "piano": return piano(ctx, when, freq, dur, vel, out);
    case "timpani": return drum(ctx, when, freq, vel, out, 0.6, 1.5);
    case "warDrum": return drum(ctx, when, Math.max(50, freq * 0.5), vel, out, 0.35, 1.8);
    case "frameDrum": return drum(ctx, when, Math.max(70, freq * 0.6), vel, out, 0.25, 1.6);
    case "shaker": return noiseHit(ctx, when, vel, out, 6800, 0.055, 1.8);
    case "woodBlock": return woodBlock(ctx, when, vel, out);
    case "cymSwell": return cymSwell(ctx, when, dur, vel, out);
    default: {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = adsr(ctx, when, dur, vel * 0.12, 0.02, 0.2);
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + dur + 0.3);
    }
  }
}
