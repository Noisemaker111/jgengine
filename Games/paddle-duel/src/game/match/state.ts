import { seededRng } from "@jgengine/core/random/rng";

import { COURT_H, COURT_W, SERVE_SPEED } from "../rules";

export type Mode = "ai-easy" | "ai-medium" | "ai-hard" | "two-player";
export type Difficulty = "easy" | "medium" | "hard";
export type Phase = "menu" | "serve" | "rally" | "gameover";
export type Side = "L" | "R";

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PaddleState {
  y: number;
}

export interface LeftInput {
  dragActive: boolean;
  dragY: number;
}

export interface TrailPoint {
  x: number;
  y: number;
}

export interface MatchState {
  mode: Mode | null;
  phase: Phase;
  ball: BallState;
  left: PaddleState;
  right: PaddleState;
  scoreL: number;
  scoreR: number;
  server: Side;
  firstServer: Side;
  serveCountdown: number;
  volley: number;
  ballSpeed: number;
  winner: Side | null;
  paused: boolean;
  hitFlashL: number;
  hitFlashR: number;
  edgePulseL: number;
  edgePulseR: number;
  matchPointL: boolean;
  matchPointR: boolean;
  trail: TrailPoint[];
  leftInput: LeftInput;
  aiTimer: number;
  aiTargetY: number;
  matchIndex: number;
  rng: () => number;
}

export const BASE_SEED = 0x50_4e_47;

export function createMatchState(): MatchState {
  return {
    mode: null,
    phase: "menu",
    ball: { x: COURT_W / 2, y: COURT_H / 2, vx: 0, vy: 0 },
    left: { y: COURT_H / 2 },
    right: { y: COURT_H / 2 },
    scoreL: 0,
    scoreR: 0,
    server: "L",
    firstServer: "L",
    serveCountdown: 0,
    volley: 0,
    ballSpeed: SERVE_SPEED,
    winner: null,
    paused: false,
    hitFlashL: 0,
    hitFlashR: 0,
    edgePulseL: 0,
    edgePulseR: 0,
    matchPointL: false,
    matchPointR: false,
    trail: [],
    leftInput: { dragActive: false, dragY: COURT_H / 2 },
    aiTimer: 0,
    aiTargetY: COURT_H / 2,
    matchIndex: 0,
    rng: seededRng(BASE_SEED),
  };
}
