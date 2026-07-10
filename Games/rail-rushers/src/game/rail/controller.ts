import { nextJunctionAhead, playerHeading, playerWorldXZ } from "./movement";
import type { NodeId } from "./network";
import {
  createRunSession,
  registerThrottlePress,
  resetSession,
  throwJunction as throwJunctionOnSession,
  tickSession,
  type RunSession,
} from "./session";
import { TRAINS, trainPositionAt } from "./schedule";

export type RunPhase = "start" | "racing" | "finished";

export interface TelegraphEntry {
  id: number;
  text: string;
}

export interface WorldPose {
  position: readonly [number, number, number];
  heading: number;
}

export interface RunSnapshot {
  phase: RunPhase;
  now: number;
  session: RunSession;
  telegraph: readonly TelegraphEntry[];
  playerPose: WorldPose;
  trainPoses: Readonly<Record<string, WorldPose>>;
}

export interface RunController {
  snapshot(): RunSnapshot;
  attach(): void;
  detach(): void;
  confirm(): void;
  restart(): void;
  throwJunction(nodeId: NodeId): void;
  throwNextJunctionAhead(): void;
  tick(dt: number): void;
}

const TELEGRAPH_LIMIT = 5;

export function createRunController(groundHeightAt: (x: number, z: number) => number): RunController {
  let phase: RunPhase = "start";
  let now = 0;
  let session: RunSession = createRunSession();
  let telegraph: TelegraphEntry[] = [];
  let telegraphSeq = 0;
  let attached = false;
  const held = new Set<string>();

  function pushTelegraph(text: string): void {
    telegraphSeq += 1;
    telegraph = [{ id: telegraphSeq, text }, ...telegraph].slice(0, TELEGRAPH_LIMIT);
  }

  function worldPoseFromXZ(x: number, z: number, heading: number): WorldPose {
    return { position: [x, groundHeightAt(x, z), z], heading };
  }

  function onKeyDown(event: KeyboardEvent): void {
    held.add(event.code);
    if (event.repeat) return;
    if (event.code === "KeyW") {
      session = registerThrottlePress(session, now);
    } else if (event.code === "Space") {
      event.preventDefault();
      api.throwNextJunctionAhead();
    } else if (event.code === "KeyR") {
      api.restart();
    } else if (event.code === "Enter") {
      api.confirm();
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    held.delete(event.code);
  }

  const api: RunController = {
    snapshot() {
      const [px, pz] = playerWorldXZ(session.player);
      const playerPose = worldPoseFromXZ(px, pz, playerHeading(session.player));
      const trainPoses: Record<string, WorldPose> = {};
      for (const train of TRAINS) {
        const pose = trainPositionAt(train, now);
        trainPoses[train.id] = worldPoseFromXZ(pose.x, pose.z, pose.heading);
      }
      return { phase, now, session, telegraph, playerPose, trainPoses };
    },
    attach() {
      if (attached || typeof window === "undefined") return;
      attached = true;
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      pushTelegraph(`EXPRESS DUE AT TERMINUS — ${Math.round(session.deadlineSeconds)} SECONDS`);
    },
    detach() {
      if (!attached || typeof window === "undefined") return;
      attached = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      held.clear();
    },
    confirm() {
      if (phase === "start") phase = "racing";
    },
    restart() {
      phase = "start";
      now = 0;
      session = resetSession();
      telegraph = [];
      telegraphSeq = 0;
      pushTelegraph(`EXPRESS DUE AT TERMINUS — ${Math.round(session.deadlineSeconds)} SECONDS`);
    },
    throwJunction(nodeId) {
      if (phase !== "racing") return;
      const wasReverse = session.throwStates[nodeId] === "reverse";
      session = throwJunctionOnSession(session, nodeId);
      pushTelegraph(`JUNCTION ${junctionNumber(nodeId)} THROWN — ${wasReverse ? "NORMAL" : "REVERSE"}`);
    },
    throwNextJunctionAhead() {
      if (phase !== "racing") return;
      const nodeId = nextJunctionAhead(session.player, session.throwStates);
      if (nodeId === null) return;
      api.throwJunction(nodeId);
    },
    tick(dt) {
      if (phase !== "racing") return;
      const wasPardonUsed = session.wreck.pardonUsed;
      const priorOutcome = session.outcome.status;
      session = tickSession(session, dt, { throttle: held.has("KeyW"), brake: held.has("KeyS") }, now);
      now += dt;
      if (!wasPardonUsed && session.wreck.pardonUsed) {
        pushTelegraph("JUMP CLEAR! — 10 SECOND PENALTY");
      }
      const outcome = session.outcome;
      if (priorOutcome === "racing" && outcome.status !== "racing") {
        phase = "finished";
        if (outcome.status === "won") {
          pushTelegraph(`CLEAR RUNNING, RUSHER — WON BY ${Math.max(0, outcome.marginSeconds).toFixed(1)}s`);
        } else if (outcome.status === "wrecked") {
          pushTelegraph(`WRECKED — ${outcome.reason.toUpperCase()}`);
        } else {
          pushTelegraph("THE EXPRESS BEAT YOU IN");
        }
      }
    },
  };

  return api;
}

function junctionNumber(nodeId: NodeId): string {
  const match = /j(\d+)/.exec(nodeId);
  return match?.[1] ?? nodeId;
}
