import { GATES, type ForkSpec, type GateSpec } from "./catalog";

export type ForkChoice = "fast" | "safe";

export type RunEventKind =
  | "forkWarn"
  | "forkLock"
  | "strikeHit"
  | "gate"
  | "leadCritical"
  | "lullStart"
  | "phase"
  | "win"
  | "lose";

export interface RunEvent {
  readonly id: string;
  readonly at: number;
  readonly kind: RunEventKind;
  readonly text: string;
}

export function forkWarnLine(fork: ForkSpec): string {
  return `Fork ahead — ${fork.safeName}'s slow but she's dry, ${fork.fastName} cuts it close to the wall.`;
}

export function forkLockLine(fork: ForkSpec, choice: ForkChoice): string {
  return choice === "fast"
    ? `Cutting the ${fork.fastName} — hang on, this one runs the storm shoulder.`
    : `Taking the ${fork.safeName}. Long way round, but she's clean.`;
}

export function strikeHitLine(fork: ForkSpec): string {
  return `Strike found us on the ${fork.fastName} — stalling out!`;
}

export function gateLine(gate: GateSpec): string {
  return `${gate.name} — clear. Gate ${gate.index} of ${GATES.length}.`;
}

export function leadCriticalLine(): string {
  return "She's right on our tail — storm wall closing fast!";
}

export function lullStartLine(label: string): string {
  return `${label} — storm's catching her breath. Make it count.`;
}

export function phaseLine(label: string): string {
  return `${label} — she's picking up the pace out there.`;
}

export function winLine(): string {
  return "Shelter in sight — we outran her!";
}

export function loseLine(gate: number): string {
  return `THE LINE TOOK US AT GATE ${gate}`;
}
