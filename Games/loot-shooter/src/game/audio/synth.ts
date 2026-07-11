export const SAMPLE_RATE = 22050;

export type WaveShape = "sine" | "square" | "saw" | "triangle" | "noise";

export interface ToneSpec {
  seconds: number;
  startFreq: number;
  endFreq?: number;
  wave?: WaveShape;
  attack?: number;
  decay?: number;
  gain?: number;
  at?: number;
}

function seededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

function oscillate(shape: WaveShape, phase: number, noise: () => number): number {
  const t = phase % 1;
  switch (shape) {
    case "sine":
      return Math.sin(t * Math.PI * 2);
    case "square":
      return t < 0.5 ? 1 : -1;
    case "saw":
      return t * 2 - 1;
    case "triangle":
      return t < 0.5 ? t * 4 - 1 : 3 - t * 4;
    case "noise":
      return noise();
  }
}

export function renderTones(layers: readonly ToneSpec[]): Float32Array {
  const total = layers.reduce((max, layer) => Math.max(max, (layer.at ?? 0) + layer.seconds), 0);
  const samples = new Float32Array(Math.round(total * SAMPLE_RATE));
  const noise = seededNoise(0x1007e7);
  for (const layer of layers) {
    const start = Math.floor((layer.at ?? 0) * SAMPLE_RATE);
    const length = Math.floor(layer.seconds * SAMPLE_RATE);
    const endFreq = layer.endFreq ?? layer.startFreq;
    const attack = Math.max(1, Math.floor((layer.attack ?? 0.004) * SAMPLE_RATE));
    const decay = layer.decay ?? 6;
    const gain = layer.gain ?? 0.8;
    const shape = layer.wave ?? "sine";
    let phase = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const progress = length <= 1 ? 0 : i / (length - 1);
      const freq = layer.startFreq + (endFreq - layer.startFreq) * progress;
      phase += freq / SAMPLE_RATE;
      const envelope = Math.min(1, i / attack) * Math.exp(-t * decay);
      const index = start + i;
      if (index < samples.length) samples[index] += oscillate(shape, phase, noise) * envelope * gain;
    }
  }
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i]!;
    samples[i] = value > 1 ? 1 : value < -1 ? -1 : value;
  }
  return samples;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += BASE64_CHARS[a >> 2]! + BASE64_CHARS[((a & 3) << 4) | (b >> 4)]!;
    out += i + 1 < bytes.length ? BASE64_CHARS[((b & 15) << 2) | (c >> 6)]! : "=";
    out += i + 2 < bytes.length ? BASE64_CHARS[c & 63]! : "=";
  }
  return out;
}

export function wavBytes(samples: Float32Array): Uint8Array {
  const dataLength = samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * 2, Math.round(samples[i]! * 32767), true);
  }
  return bytes;
}

export function synthWavDataUri(layers: readonly ToneSpec[]): string {
  return `data:audio/wav;base64,${toBase64(wavBytes(renderTones(layers)))}`;
}
