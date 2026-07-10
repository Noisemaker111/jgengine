export type Ball = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  live: boolean;
  hitFlash: number;
  age: number;
};

export type Peg = { x: number; y: number; r: number; glow: number };

export type CatcherKind = "gutter" | "pocket" | "gate";

export type Catcher = {
  x0: number;
  x1: number;
  payout: number;
  kind: CatcherKind;
  flash: number;
  lit: boolean;
};

export type Sparkle = { x: number; y: number; vx: number; vy: number; life: number; ttl: number };

export type FloatText = {
  x: number;
  y: number;
  text: string;
  life: number;
  ttl: number;
  kind: "win" | "gate" | "fever";
};

export type WinEntry = { amount: number; kind: CatcherKind; fever: boolean; seq: number };

export type PachinkoSnapshot = {
  bank: number;
  ballsInFlight: number;
  launched: number;
  power: number;
  charging: boolean;
  autoFire: boolean;
  feverActive: boolean;
  feverTimer: number;
  feverProgress: number;
  gateHits: number;
  feverTarget: number;
  feverCount: number;
  broke: boolean;
  wins: readonly WinEntry[];
  bankHistory: readonly number[];
  bestBank: number | null;
  bestFever: number | null;
};
