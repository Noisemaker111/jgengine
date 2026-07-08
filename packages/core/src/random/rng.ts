function hashSeed(seed: string | number): number {
  const text = typeof seed === "number" ? seed.toString() : seed;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRng(seed: string | number): () => number {
  let a = hashSeed(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededStreams(seed: string | number): (stream: string) => () => number {
  const base = typeof seed === "number" ? seed.toString() : seed;
  return (stream) => seededRng(`${base}:${stream}`);
}
