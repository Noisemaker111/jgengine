import { useGameStore } from "@jgengine/react/hooks";
import type { RunSnapshot } from "../../run/session";

const IDLE: RunSnapshot = {
  status: "ready",
  wave: 1,
  waveTotal: 10,
  endless: false,
  alive: 0,
  intermissionLeft: 0,
  kills: 0,
  score: 0,
  shotsFired: 0,
  shotsHit: 0,
  elapsed: 0,
};

export function useRun(): RunSnapshot {
  return useGameStore((ctx) => (ctx.game.store.get("run") as RunSnapshot | undefined) ?? IDLE);
}

export function useSelectedSlot(): number {
  return useGameStore((ctx) => (ctx.game.store.get("selectedSlot") as number | undefined) ?? 0);
}

export interface RunRecords {
  score?: number;
  wave?: number;
  accuracy?: number;
}

export function useRecords(): RunRecords {
  return useGameStore((ctx) => (ctx.game.store.get("records") as RunRecords | undefined) ?? {});
}
