import { DEFAULT_SEED, BALLS_PER_GAME, ROLLOVER_LABELS, TILT_LIMIT } from "./config";
import { browserStorage, createRecords, type PinballRecords } from "./records";
import { PinballSim } from "./sim";
import type { PinballSnapshot } from "./types";

export interface KeyInput {
  left: boolean;
  right: boolean;
  plunge: boolean;
  nudge: boolean;
}

export class PinballStore {
  sim: PinballSim;
  private records: PinballRecords;
  private listeners = new Set<(state: PinballSnapshot) => void>();
  private snapshot: PinballSnapshot;
  private signature = "";
  private seed: string | number;

  private pLeft = false;
  private pRight = false;
  private pPlunge = false;
  private prevNudge = false;

  constructor(seed: string | number = DEFAULT_SEED) {
    this.seed = seed;
    this.sim = new PinballSim({ seed });
    this.records = createRecords(browserStorage());
    this.snapshot = this.build();
    this.signature = this.sign();
  }

  getState(): PinballSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (state: PinballSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  setPointerFlip(side: "left" | "right", down: boolean): void {
    if (side === "left") this.pLeft = down;
    else this.pRight = down;
    this.refresh();
  }

  setPointerPlunge(down: boolean): void {
    this.pPlunge = down;
    this.refresh();
  }

  nudge(): void {
    this.sim.nudge();
    this.refresh();
  }

  newGame(): void {
    this.pLeft = false;
    this.pRight = false;
    this.pPlunge = false;
    this.prevNudge = false;
    this.sim.startNewGame();
    this.refresh(true);
  }

  reset(seed: string | number = this.seed): void {
    this.seed = seed;
    this.pLeft = false;
    this.pRight = false;
    this.pPlunge = false;
    this.prevNudge = false;
    this.sim = new PinballSim({ seed });
    this.refresh(true);
  }

  sync(): void {
    this.refresh(true);
  }

  tick(dt: number, kb: KeyInput): void {
    const nudgeHeld = kb.nudge;
    if (nudgeHeld && !this.prevNudge) this.sim.nudge();
    this.prevNudge = nudgeHeld;
    this.sim.step(dt, {
      left: kb.left || this.pLeft,
      right: kb.right || this.pRight,
      plunger: kb.plunge || this.pPlunge,
    });
    this.records.submit({ score: this.sim.score, ball: this.sim.lastBallScore });
    this.refresh();
  }

  private refresh(force = false): void {
    const sig = this.sign();
    if (!force && sig === this.signature) return;
    this.signature = sig;
    this.snapshot = this.build();
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private sign(): string {
    const s = this.sim;
    return [
      s.phase,
      s.score,
      s.ballIndex,
      s.ballsRemaining,
      s.multiplierIndex,
      Math.round(s.plungerCharge * 100),
      s.charging ? 1 : 0,
      s.rolloverLit.map((v) => (v ? 1 : 0)).join(""),
      s.table.dropTargets.map((d) => (d.up ? 1 : 0)).join(""),
      s.dropCompletions,
      s.extraBallLit ? 1 : 0,
      s.spotBonusLit ? 1 : 0,
      s.accBonus,
      s.tiltCount,
      s.tilted ? 1 : 0,
      s.saverActive() ? 1 : 0,
      Math.ceil(s.ballTimer),
      s.events[0]?.seq ?? 0,
      Math.ceil(s.messageTimer * 4),
      this.records.bestOf("score") ?? -1,
      this.records.bestOf("ball") ?? -1,
    ].join("|");
  }

  private build(): PinballSnapshot {
    const s = this.sim;
    return {
      phase: s.phase,
      score: s.score,
      ballScore: s.score - s.ballStartScore,
      ballIndex: s.ballIndex,
      ballsRemaining: s.ballsRemaining,
      ballsPerGame: BALLS_PER_GAME,
      plungerCharge: s.plungerCharge,
      charging: s.charging,
      onPlunger: s.onPlunger(),
      multiplier: s.multiplier(),
      multiplierIndex: s.multiplierIndex,
      rolloverLit: s.rolloverLit.slice(),
      rolloverLabels: ROLLOVER_LABELS.slice(),
      dropUp: s.table.dropTargets.map((d) => d.up),
      dropCompletions: s.dropCompletions,
      spotBonusLit: s.spotBonusLit,
      extraBallLit: s.extraBallLit,
      accBonus: s.accBonus,
      saverActive: s.saverActive(),
      saverTimer: s.saverActive() ? Math.max(0, 5 - s.ballTimer) : 0,
      tiltCount: s.tiltCount,
      tilted: s.tilted,
      tiltLimit: TILT_LIMIT,
      message: s.messageTimer > 0 ? s.message : "",
      messageKind: s.messageKind,
      events: s.events.slice(),
      bestScore: this.records.bestOf("score"),
      bestBall: this.records.bestOf("ball"),
      lastEndBonus: s.lastEndBonus,
    };
  }
}

export const pinballStore = new PinballStore();
