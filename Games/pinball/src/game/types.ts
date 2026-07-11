export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Wall {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
  e: number;
  kick?: number;
  slingId?: number;
}

export interface Barrier {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  capR: number;
  e: number;
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
  e: number;
  kick: number;
  id: number;
  flash: number;
}

export interface Slingshot {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  id: number;
  flash: number;
}

export interface DropTarget {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  capR: number;
  up: boolean;
  flash: number;
}

export interface RolloverLane {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Flipper {
  side: "left" | "right";
  px: number;
  py: number;
  len: number;
  capR: number;
  rest: number;
  active: number;
  angle: number;
  omega: number;
  up: boolean;
  glow: number;
}

export type Phase = "ready" | "play" | "gameover";

export interface ScoreEvent {
  seq: number;
  label: string;
  amount: number;
  kind: "bumper" | "sling" | "rollover" | "drop" | "bonus" | "special";
}

export interface PinballSnapshot {
  phase: Phase;
  score: number;
  ballScore: number;
  ballIndex: number;
  ballsRemaining: number;
  ballsPerGame: number;
  plungerCharge: number;
  charging: boolean;
  onPlunger: boolean;
  multiplier: number;
  multiplierIndex: number;
  rolloverLit: readonly boolean[];
  rolloverLabels: readonly string[];
  dropUp: readonly boolean[];
  dropCompletions: number;
  spotBonusLit: boolean;
  extraBallLit: boolean;
  accBonus: number;
  saverActive: boolean;
  saverTimer: number;
  tiltCount: number;
  tilted: boolean;
  tiltLimit: number;
  message: string;
  messageKind: ScoreEvent["kind"] | "tilt" | "save";
  events: readonly ScoreEvent[];
  bestScore: number | null;
  bestBall: number | null;
  lastEndBonus: number;
}
