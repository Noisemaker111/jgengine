import { seededStreams } from "@jgengine/core/random/rng";
import { CREATURE_COUNT, PALETTE } from "../../constants";

export interface CreatureDef {
  id: string;
  tint: string;
  sizeScale: number;
  glowStrength: number;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpHex(fromHex: string, toHex: string, t: number): string {
  const from = Number.parseInt(fromHex.slice(1), 16);
  const to = Number.parseInt(toHex.slice(1), 16);
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = lerpChannel(fr, tr, t);
  const g = lerpChannel(fg, tg, t);
  const b = lerpChannel(fb, tb, t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function buildCreatures(seed: string): readonly CreatureDef[] {
  const streams = seededStreams(seed);
  const tintRng = streams("creature-tint");
  const sizeRng = streams("creature-size");
  const glowRng = streams("creature-glow");
  const entries: CreatureDef[] = [];
  for (let i = 0; i < CREATURE_COUNT; i += 1) {
    const tintT = tintRng();
    entries.push({
      id: `creature-${String(i).padStart(2, "0")}`,
      tint: lerpHex(PALETTE.spiritMint, PALETTE.spiritRose, tintT),
      sizeScale: 0.78 + sizeRng() * 0.42,
      glowStrength: 0.6 + glowRng() * 0.5,
    });
  }
  return entries;
}

export const CREATURES: readonly CreatureDef[] = buildCreatures("neon-shepherd-herd");
export const CREATURE_IDS: readonly string[] = CREATURES.map((creature) => creature.id);

export function creatureById(id: string): CreatureDef | undefined {
  return CREATURES.find((creature) => creature.id === id);
}
