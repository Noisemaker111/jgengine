import { describe, expect, test } from "bun:test";

import type { DamageAppliedEvent } from "@jgengine/core/game/events";

import { attachAdaptiveMusic, type AdaptiveMusicSource } from "./adaptiveMusicWire";

function bus() {
  const handlers = new Map<string, ((event: never) => void)[]>();
  const listOf = (name: string) => handlers.get(name) ?? handlers.set(name, []).get(name)!;
  return {
    on: ((name: string, handler: (event: never) => void) => {
      listOf(name).push(handler);
      return () => listOf(name).splice(listOf(name).indexOf(handler), 1);
    }) as AdaptiveMusicSource["on"],
    isLocal: (id: string | undefined) => id === "me",
    emit: (event: Partial<DamageAppliedEvent>) => {
      for (const handler of [...listOf("combat.damage")]) handler({ amount: 10, lethal: false, ...event } as never);
    },
    push: (amount: number) => {
      for (const handler of [...listOf("audio.intensity")]) handler({ amount } as never);
    },
    count: () => [...handlers.values()].reduce((sum, list) => sum + list.length, 0),
  };
}

describe("attachAdaptiveMusic", () => {
  test("starts on explore, escalates on the local player's fight, ignores everyone else's", () => {
    const events = bus();
    const played: (string | null)[] = [];
    let now = 0;
    const off = attachAdaptiveMusic(events, (theme) => played.push(theme), {}, () => now);
    expect(played).toEqual(["jg.explore"]);

    events.emit({ source: "npc", target: "other" });
    expect(played).toEqual(["jg.explore"]);

    now = 100;
    events.emit({ source: "enemy", target: "me" });
    expect(played.at(-1)).toBe("jg.tension");
    now = 200;
    events.emit({ source: "me", target: "enemy", lethal: true });
    expect(played.at(-1)).toBe("jg.fight");
    off();
    expect(events.count()).toBe(0);
  });

  test("a game with no avatar pushes its own intensity: a released wave brings the fight in", () => {
    const events = bus();
    const played: (string | null)[] = [];
    const off = attachAdaptiveMusic(events, (theme) => played.push(theme), {}, () => 0);
    events.push(0.7);
    expect(played).toEqual(["jg.explore", "jg.fight"]);
    events.push(-1);
    expect(played).toHaveLength(2);
    off();
  });
});
