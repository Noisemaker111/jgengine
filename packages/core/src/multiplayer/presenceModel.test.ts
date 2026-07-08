import { describe, expect, test } from "bun:test";

import {
  decidePoseSync,
  isPresenceExpired,
  pickReusablePresence,
  resolveActivePresence,
  shouldPersistWorldSnapshot,
  type PoseSyncRules,
} from "./presenceModel";

const RULES: PoseSyncRules = {
  maxSpeed: 16,
  maxVerticalOffset: 1.15,
  minElapsedSec: 0.05,
  maxElapsedSec: 1.5,
  keepAliveRefreshMs: 60_000,
};

const CURRENT = {
  position: { x: 0, y: 0, z: 0 },
  rotationY: 0,
  rotationPitch: 0,
  lastSeenAtMs: 1_000,
};

describe("decidePoseSync", () => {
  test("accepts in-speed movement and marks changed", () => {
    const d = decidePoseSync(CURRENT, { position: { x: 1, z: 1 } }, RULES, 2_000);
    expect(d.position.x).toBe(1);
    expect(d.position.z).toBe(1);
    expect(d.changed).toBe(true);
    expect(d.refreshKeepAlive).toBe(false);
  });

  test("clamps teleport-distance moves to the speed cap", () => {
    const d = decidePoseSync(CURRENT, { position: { x: 100, z: 0 } }, RULES, 2_000);
    expect(d.position.x).toBeCloseTo(16);
    expect(d.changed).toBe(true);
  });

  test("clamps vertical offset and keeps current y when omitted", () => {
    const jump = decidePoseSync(CURRENT, { position: { x: 0, z: 0, y: 5 } }, RULES, 2_000);
    expect(jump.position.y).toBe(1.15);
    const keep = decidePoseSync(
      { ...CURRENT, position: { x: 0, y: 0.4, z: 0 } },
      { position: { x: 0, z: 0 } },
      RULES,
      2_000,
    );
    expect(keep.position.y).toBe(0.4);
  });

  test("unchanged pose with fresh keep-alive decides no write", () => {
    const d = decidePoseSync(CURRENT, { position: { x: 0, z: 0 }, rotationY: 0 }, RULES, 2_000);
    expect(d.changed).toBe(false);
    expect(d.refreshKeepAlive).toBe(false);
  });

  test("unchanged pose with stale keep-alive decides a refresh", () => {
    const d = decidePoseSync(CURRENT, { position: { x: 0, z: 0 } }, RULES, 100_000);
    expect(d.changed).toBe(false);
    expect(d.refreshKeepAlive).toBe(true);
  });

  test("rotation-only change is a pose write", () => {
    const d = decidePoseSync(CURRENT, { position: { x: 0, z: 0 }, rotationY: 1.2 }, RULES, 2_000);
    expect(d.changed).toBe(true);
    expect(d.rotationY).toBe(1.2);
  });

  test("appearance passes through on accepted updates", () => {
    const d = decidePoseSync(CURRENT, { position: { x: 1, z: 1 }, appearance: { skin: "red" } }, RULES, 2_000);
    expect(d.changed).toBe(true);
    expect(d.appearance).toEqual({ skin: "red" });
  });

  test("appearance-only change is accepted despite unmoved position", () => {
    const withAppearance = { ...CURRENT, appearance: { skin: "blue" } };
    const d = decidePoseSync(
      withAppearance,
      { position: { x: 0, z: 0 }, appearance: { skin: "red" } },
      RULES,
      2_000,
    );
    expect(d.changed).toBe(true);
    expect(d.position.x).toBe(0);
    expect(d.appearance).toEqual({ skin: "red" });
  });

  test("unchanged appearance does not force a write", () => {
    const withAppearance = { ...CURRENT, appearance: { skin: "blue" } };
    const d = decidePoseSync(
      withAppearance,
      { position: { x: 0, z: 0 }, appearance: { skin: "blue" } },
      RULES,
      2_000,
    );
    expect(d.changed).toBe(false);
  });

  test("omitted appearance keeps the stored value", () => {
    const withAppearance = { ...CURRENT, appearance: { skin: "blue" } };
    const d = decidePoseSync(withAppearance, { position: { x: 0, z: 0 } }, RULES, 2_000);
    expect(d.changed).toBe(false);
    expect(d.appearance).toEqual({ skin: "blue" });
  });
});

describe("shouldPersistWorldSnapshot", () => {
  test("persists when never saved or interval elapsed", () => {
    expect(shouldPersistWorldSnapshot(undefined, 1_000, 30_000)).toBe(true);
    expect(shouldPersistWorldSnapshot(1_000, 40_000, 30_000)).toBe(true);
    expect(shouldPersistWorldSnapshot(1_000, 20_000, 30_000)).toBe(false);
  });
});

describe("resolveActivePresence", () => {
  test("picks the most recent active row and lists extras", () => {
    const rows = [
      { revokedAt: undefined, lastSeenAt: 10 },
      { revokedAt: undefined, lastSeenAt: 30 },
      { revokedAt: 5, lastSeenAt: 99 },
      { revokedAt: undefined, lastSeenAt: 20 },
    ];
    const { active, extras } = resolveActivePresence(rows);
    expect(active?.lastSeenAt).toBe(30);
    expect(extras.map((r) => r.lastSeenAt)).toEqual([20, 10]);
  });

  test("empty and all-revoked rows resolve to null", () => {
    expect(resolveActivePresence([]).active).toBeNull();
    expect(resolveActivePresence([{ revokedAt: 1, lastSeenAt: 5 }]).active).toBeNull();
  });
});

describe("isPresenceExpired", () => {
  test("expires exactly at the cutoff", () => {
    expect(isPresenceExpired(0, 240_000, 240_000)).toBe(true);
    expect(isPresenceExpired(1, 240_000, 240_000)).toBe(false);
  });
});

describe("pickReusablePresence", () => {
  test("picks the most recently seen row", () => {
    const rows = [{ id: "a", lastSeenAt: 10 }, { id: "b", lastSeenAt: 30 }, { id: "c", lastSeenAt: 20 }];
    expect(pickReusablePresence(rows)?.id).toBe("b");
  });

  test("treats missing lastSeenAt as oldest", () => {
    const rows = [{ id: "a" }, { id: "b", lastSeenAt: 5 }];
    expect(pickReusablePresence(rows)?.id).toBe("b");
  });

  test("empty rows resolve to undefined", () => {
    expect(pickReusablePresence([])).toBeUndefined();
  });
});
