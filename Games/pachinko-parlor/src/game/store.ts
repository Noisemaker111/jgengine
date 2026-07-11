import { DEFAULT_SEED, FEVER_GATE_TARGET } from "./config";
import { browserStorage, createRecords, type PachinkoRecords } from "./records";
import { PachinkoSim } from "./sim";
import type { PachinkoSnapshot } from "./types";

export class PachinkoStore {
  sim: PachinkoSim;
  private records: PachinkoRecords;
  private listeners = new Set<(snapshot: PachinkoSnapshot) => void>();
  private snapshot: PachinkoSnapshot;
  private signature = "";
  private pointerHeld = false;
  private seed: string | number;

  constructor(seed: string | number = DEFAULT_SEED) {
    this.seed = seed;
    this.sim = new PachinkoSim({ seed });
    this.records = createRecords(browserStorage());
    this.snapshot = this.build();
    this.signature = this.sign();
  }

  getState(): PachinkoSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: PachinkoSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setPointerHeld(held: boolean): void {
    this.pointerHeld = held;
    this.refresh();
  }

  toggleAutoFire(): void {
    this.sim.toggleAutoFire();
    this.refresh();
  }

  rebuy(): void {
    this.sim.rebuy();
    this.refresh();
  }

  reset(seed: string | number = this.seed): void {
    this.seed = seed;
    this.pointerHeld = false;
    this.sim = new PachinkoSim({ seed });
    this.refresh(true);
  }

  sync(): void {
    this.refresh(true);
  }

  tick(dt: number, keyHeld: boolean): void {
    this.sim.step(dt, { charging: keyHeld || this.pointerHeld });
    this.records.submit({ bank: this.sim.bank, fever: this.sim.feverCount });
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
      s.bank,
      s.launched,
      Math.round(s.power * 100),
      s.liveBalls(),
      s.feverActive ? 1 : 0,
      Math.ceil(s.feverTimer),
      s.gateHits,
      s.autoFire ? 1 : 0,
      s.broke ? 1 : 0,
      s.bankHistory.length,
      s.charging || this.pointerHeld ? 1 : 0,
      this.records.bestOf("bank") ?? -1,
      this.records.bestOf("fever") ?? -1,
    ].join("|");
  }

  private build(): PachinkoSnapshot {
    const s = this.sim;
    return {
      bank: s.bank,
      ballsInFlight: s.liveBalls(),
      launched: s.launched,
      power: s.power,
      charging: s.charging || this.pointerHeld,
      autoFire: s.autoFire,
      feverActive: s.feverActive,
      feverTimer: s.feverTimer,
      feverProgress: s.gateHits / FEVER_GATE_TARGET,
      gateHits: s.gateHits,
      feverTarget: FEVER_GATE_TARGET,
      feverCount: s.feverCount,
      broke: s.broke,
      wins: s.wins.slice(),
      bankHistory: s.bankHistory.slice(),
      bestBank: this.records.bestOf("bank"),
      bestFever: this.records.bestOf("fever"),
    };
  }
}

export const pachinkoStore = new PachinkoStore();
