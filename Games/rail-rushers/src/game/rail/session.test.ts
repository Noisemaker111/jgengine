import { describe, expect, test } from "bun:test";
import {
  createRunSession,
  registerThrottlePress,
  resetSession,
  throwJunction,
  throwNextJunctionAhead,
  tickSession,
} from "./session";

const HOLD: { throttle: boolean; brake: boolean } = { throttle: true, brake: false };

function driveToOutcome(maxSeconds = 400) {
  let session = createRunSession();
  const dt = 1 / 60;
  let now = 0;
  while (session.outcome.status === "racing" && now < maxSeconds) {
    session = tickSession(session, dt, HOLD, now);
    now += dt;
  }
  return session;
}

describe("session lifecycle", () => {
  test("starts racing with a positive deadline and default throw states", () => {
    const session = createRunSession();
    expect(session.outcome.status).toBe("racing");
    expect(session.deadlineSeconds).toBeGreaterThan(0);
    expect(session.throwStates.j1).toBe("normal");
  });

  test("throwing a junction toggles its state, and toggling twice returns to normal", () => {
    let session = createRunSession();
    session = throwJunction(session, "j1");
    expect(session.throwStates.j1).toBe("reverse");
    session = throwJunction(session, "j1");
    expect(session.throwStates.j1).toBe("normal");
  });

  test("throwNextJunctionAhead throws junction 1 from the starting position", () => {
    const session = throwNextJunctionAhead(createRunSession());
    expect(session.throwStates.j1).toBe("reverse");
  });

  test("eventually reaches a terminal outcome (won or lost) when driven to completion", () => {
    const session = driveToOutcome();
    expect(["won", "lost-to-express", "wrecked"]).toContain(session.outcome.status);
  });

  test("ticking a finished session is a no-op", () => {
    const finished = driveToOutcome();
    const again = tickSession(finished, 1, HOLD, 500);
    expect(again).toBe(finished);
  });
});

describe("pump bonus wiring", () => {
  test("a perfectly-timed re-press queues a positive bonus consumed by the next tick", () => {
    let session = createRunSession();
    session = registerThrottlePress(session, 0);
    session = registerThrottlePress(session, 0.5);
    expect(session.pendingPumpBonus).toBeGreaterThan(0);
    expect(session.lastPumpTierId).toBe("perfect");
    const before = session.player.speed;
    session = tickSession(session, 1 / 60, HOLD, 0.5);
    expect(session.player.speed).toBeGreaterThan(before);
    expect(session.pendingPumpBonus).toBe(0);
  });
});

describe("restart purity", () => {
  test("resetSession produces a fresh, independent session", () => {
    let session = createRunSession();
    session = tickSession(session, 5, HOLD, 0);
    session = throwJunction(session, "j1");
    const restarted = resetSession();
    expect(restarted.player.speed).toBe(0);
    expect(restarted.player.elapsed).toBe(0);
    expect(restarted.throwStates.j1).toBe("normal");
    expect(restarted.outcome.status).toBe("racing");
  });

  test("two independent sessions never share mutable state", () => {
    const a = createRunSession();
    const b = createRunSession();
    const advancedA = tickSession(a, 2, HOLD, 0);
    expect(b.player.elapsed).toBe(0);
    expect(advancedA.player.elapsed).toBeGreaterThan(0);
  });
});

describe("collision produces a wreck via the pardon pipeline", () => {
  test("parking on the freight's own spur, the freight eventually reaches the player and spends the pardon", () => {
    let session = createRunSession();
    const dt = 1 / 60;
    let now = 0;
    while (session.player.currentEdgeId !== "e-j1-lowdale" && now < 30) {
      session = tickSession(session, dt, HOLD, now);
      now += dt;
    }
    expect(session.player.currentEdgeId).toBe("e-j1-lowdale");
    while (session.player.speed > 0.05) {
      session = tickSession(session, dt, { throttle: false, brake: true }, now);
      now += dt;
    }
    for (let i = 0; i < 60 * 95 && !session.wreck.pardonUsed; i += 1) {
      session = tickSession(session, dt, { throttle: false, brake: true }, now);
      now += dt;
    }
    expect(session.wreck.pardonUsed).toBe(true);
    expect(session.wreck.penaltySeconds).toBeGreaterThan(0);
    expect(session.outcome.status).toBe("racing");
  });
});
