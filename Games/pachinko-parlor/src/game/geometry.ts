import {
  BOARD,
  CATCH_Y,
  FIELD_BOTTOM,
  FIELD_TOP,
  GATE_PAYOUT,
  PEG_RADIUS,
  WALL,
} from "./config";
import type { Catcher, Peg } from "./types";

const PEG_ROWS = 15;
const PEG_STEP_X = 14;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function buildPegField(): Peg[] {
  const pegs: Peg[] = [];
  const rowGap = (FIELD_BOTTOM - FIELD_TOP) / (PEG_ROWS - 1);
  for (let row = 0; row < PEG_ROWS; row += 1) {
    const y = FIELD_TOP + row * rowGap;
    const t = row / (PEG_ROWS - 1);
    const inset = lerp(34, 11, t);
    const left = WALL + inset;
    const right = BOARD.width - WALL - inset;
    const stagger = (row % 2) * (PEG_STEP_X / 2);
    for (let x = left + stagger; x <= right + 0.01; x += PEG_STEP_X) {
      pegs.push({ x, y, r: PEG_RADIUS, glow: 0 });
    }
  }

  const gateLeft = BOARD.width / 2 - 11;
  const gateRight = BOARD.width / 2 + 11;
  const railTop = FIELD_BOTTOM - 30;
  const railStep = 11;
  for (let y = railTop; y <= CATCH_Y - 6 + 0.01; y += railStep) {
    pegs.push({ x: gateLeft, y, r: PEG_RADIUS, glow: 0 });
    pegs.push({ x: gateRight, y, r: PEG_RADIUS, glow: 0 });
  }
  const cx = BOARD.width / 2;
  pegs.push({ x: cx - 6.5, y: railTop - 7, r: PEG_RADIUS, glow: 0 });
  pegs.push({ x: cx + 6.5, y: railTop - 7, r: PEG_RADIUS, glow: 0 });

  const funnelY = FIELD_TOP - 12;
  for (let i = -2; i <= 2; i += 1) {
    pegs.push({ x: BOARD.width / 2 + i * 12, y: funnelY + Math.abs(i) * 6, r: PEG_RADIUS, glow: 0 });
  }

  return pegs;
}

export function buildCatchers(): Catcher[] {
  const gateHalf = 8;
  const cx = BOARD.width / 2;
  const left: Array<{ w: number; payout: number; kind: Catcher["kind"] }> = [
    { w: 58, payout: 0, kind: "gutter" },
    { w: 9, payout: 2, kind: "pocket" },
    { w: 8, payout: 3, kind: "pocket" },
    { w: 8, payout: 5, kind: "pocket" },
  ];

  const catchers: Catcher[] = [];
  let x = WALL;
  for (const slot of left) {
    catchers.push({ x0: x, x1: x + slot.w, payout: slot.payout, kind: slot.kind, flash: 0, lit: false });
    x += slot.w;
  }
  catchers.push({
    x0: cx - gateHalf,
    x1: cx + gateHalf,
    payout: GATE_PAYOUT,
    kind: "gate",
    flash: 0,
    lit: true,
  });
  x = cx + gateHalf;
  for (let i = left.length - 1; i >= 1; i -= 1) {
    const slot = left[i]!;
    catchers.push({ x0: x, x1: x + slot.w, payout: slot.payout, kind: slot.kind, flash: 0, lit: false });
    x += slot.w;
  }
  catchers.push({ x0: x, x1: BOARD.width - WALL, payout: 0, kind: "gutter", flash: 0, lit: false });
  return catchers;
}

export function slotAt(catchers: readonly Catcher[], x: number): number {
  for (let i = 0; i < catchers.length; i += 1) {
    const c = catchers[i]!;
    if (x >= c.x0 && x < c.x1) return i;
  }
  return x < BOARD.width / 2 ? 0 : catchers.length - 1;
}
