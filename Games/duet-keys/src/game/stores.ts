import { defineStore } from "@jgengine/core/store/defineStore";

import type { HeroId, V2 } from "./types";
import type { Latch } from "./rooms/engine";

export type RunStatus = "playing" | "solved" | "complete";

export interface DuetState {
  roomIndex: number;
  status: RunStatus;
  active: HeroId;
  latch: Latch;
  /** Ticks left on the "room solved" celebration before advancing. */
  solveTimer: number;
  /** Derived signals mirrored for the HUD each frame. */
  pressedPlates: readonly string[];
  poweredReceivers: readonly string[];
  openGates: readonly string[];
  activeSpikes: readonly string[];
  /** Toast text pushed by abilities/hazards, cleared after a short hold. */
  toast: string | null;
  toastTimer: number;
}

export function freshRoom(index: number): Pick<DuetState, "latch" | "solveTimer" | "toast" | "toastTimer" | "status"> & { roomIndex: number } {
  return {
    roomIndex: index,
    latch: { anchorCell: null, prism: null },
    solveTimer: 0,
    toast: null,
    toastTimer: 0,
    status: "playing",
  };
}

export const duetStore = defineStore<DuetState>("duet-keys", () => ({
  roomIndex: 0,
  status: "playing",
  active: "lumen",
  latch: { anchorCell: null, prism: null },
  solveTimer: 0,
  pressedPlates: [],
  poweredReceivers: [],
  openGates: [],
  activeSpikes: [],
  toast: null,
  toastTimer: 0,
}));

export function withAnchor(latch: Latch, anchorCell: V2 | null): Latch {
  return { anchorCell, prism: latch.prism };
}

export function withPrism(latch: Latch, prism: Latch["prism"]): Latch {
  return { anchorCell: latch.anchorCell, prism };
}
