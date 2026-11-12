import { describe, expect, test } from "bun:test";

import type { DamageAppliedEvent } from "../game/events";
import { createGameEvents } from "../game/events";
import { createHitMarkers, hitMarkerKindOf, isLocalSource, type HitMarkerTiming } from "./hitMarker";

const mine = (id: string) => id === "hero";

function blow(patch: Partial<DamageAppliedEvent> = {}): DamageAppliedEvent {
  return { target: "mob", source: "hero", type: "damage", amount: 10, absorbed: 0, remaining: 40, lethal: false, ...patch };
}

const TIMING: HitMarkerTiming = { lifeMs: { hit: 200, crit: 300, kill: 500 }, popMs: 100, popScale: 1.5, fadeMs: 50, volleyMs: 40 };

describe("isLocalSource", () => {
  function ctx(possessed: string) {
    return { player: { userId: "p1", possession: { active: () => possessed } } } as never;
  }

  test("the local player and what they drive count as local", () => {
    expect(isLocalSource(ctx("p1"), "p1")).toBe(true);
    expect(isLocalSource(ctx("car-7"), "car-7")).toBe(true);
    expect(isLocalSource(ctx("car-7"), "p1")).toBe(true);
  });

  test("anyone else, or no source, does not", () => {
    expect(isLocalSource(ctx("p1"), "enemy-3")).toBe(false);
    expect(isLocalSource(ctx("p1"), undefined)).toBe(false);
  });
});

describe("hitMarkerKindOf", () => {
  test("a direct blow by the local player is a hit, a crit or a kill", () => {
    expect(hitMarkerKindOf(blow(), mine)).toBe("hit");
    expect(hitMarkerKindOf(blow({ crit: true }), mine)).toBe("crit");
    expect(hitMarkerKindOf(blow({ lethal: true, remaining: 0 }), mine)).toBe("kill");
    // A killing crit reads as the kill.
    expect(hitMarkerKindOf(blow({ lethal: true, crit: true }), mine)).toBe("kill");
  });

  test("status ticks, empty blows, other attackers and self-harm earn no marker", () => {
    expect(hitMarkerKindOf(blow({ status: "burn" }), mine)).toBeNull();
    expect(hitMarkerKindOf(blow({ amount: 0 }), mine)).toBeNull();
    expect(hitMarkerKindOf(blow({ amount: -5 }), mine)).toBeNull();
    expect(hitMarkerKindOf(blow({ source: "enemy" }), mine)).toBeNull();
    expect(hitMarkerKindOf(blow({ source: undefined }), mine)).toBeNull();
    expect(hitMarkerKindOf(blow({ target: "hero" }), mine)).toBeNull();
  });
});

describe("createHitMarkers", () => {
  test("a marker pops in, settles, holds and fades over its kind's life", () => {
    const markers = createHitMarkers(TIMING, mine);
    expect(markers.frame(0)).toBeNull();
    markers.push("hit", 1000);
    expect(markers.frame(1000)).toMatchObject({ kind: "hit", count: 1, scale: 1.5, opacity: 1 });
    expect(markers.frame(1050)?.scale).toBeCloseTo(1.25);
    expect(markers.frame(1120)).toMatchObject({ scale: 1, opacity: 1 });
    expect(markers.frame(1175)?.opacity).toBeCloseTo(0.5);
    expect(markers.frame(1200)).toBeNull();
  });

  test("each kind keeps its own life: a kill outlasts a crit, which outlasts a hit", () => {
    const markers = createHitMarkers(TIMING, mine);
    markers.push("kill", 0);
    expect(markers.frame(450)?.kind).toBe("kill");
    expect(markers.frame(500)).toBeNull();
    markers.push("crit", 1000);
    expect(markers.frame(1250)?.kind).toBe("crit");
    expect(markers.frame(1300)).toBeNull();
  });

  test("a volley folds into one marker at its strongest blow", () => {
    const markers = createHitMarkers(TIMING, mine);
    markers.push("hit", 0);
    markers.push("hit", 10);
    markers.push("kill", 20);
    markers.push("hit", 30);
    expect(markers.frame(30)).toMatchObject({ kind: "kill", count: 4, ageMs: 30 });
    expect(markers.stats()).toEqual({ hit: 1, crit: 0, kill: 1 });
  });

  test("a blow after the volley window starts a fresh marker, even a weaker one", () => {
    const markers = createHitMarkers(TIMING, mine);
    markers.push("kill", 0);
    markers.push("hit", 100);
    expect(markers.frame(100)).toMatchObject({ kind: "hit", count: 1, ageMs: 0 });
  });

  test("it listens to combat.damage and shows only confirmed hits", () => {
    const events = createGameEvents();
    const markers = createHitMarkers(TIMING, mine);
    let now = 0;
    const off = markers.listen(events, () => now);
    events.emit("combat.damage", blow({ status: "burn" }));
    expect(markers.frame(0)).toBeNull();
    events.emit("combat.damage", blow({ source: "enemy", target: "hero" }));
    expect(markers.frame(0)).toBeNull();
    now = 10;
    events.emit("combat.damage", blow({ crit: true, position: [1, 2, 3] }));
    expect(markers.frame(10)).toMatchObject({ kind: "crit", position: [1, 2, 3] });
    off();
    now = 500;
    events.emit("combat.damage", blow({ lethal: true }));
    expect(markers.frame(500)).toBeNull();
  });
});
