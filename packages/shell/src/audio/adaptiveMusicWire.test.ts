import { describe, expect, test } from "bun:test";

import type { DamageAppliedEvent } from "@jgengine/core/game/events";

import { attachAdaptiveMusic } from "./adaptiveMusicWire";

function bus() {
  const handlers: ((event: DamageAppliedEvent) => void)[] = [];
  return {
    on: (_event: "combat.damage", handler: (event: DamageAppliedEvent) => void) => {
      handlers.push(handler);
      return () => handlers.splice(handlers.indexOf(handler), 1);
    },
    isLocal: (id: string | undefined) => id === "me",
    emit: (event: Partial<DamageAppliedEvent>) => {
      for (const handler of [...handlers]) handler({ amount: 10, lethal: false, ...event } as DamageAppliedEvent);
    },
    count: () => handlers.length,
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
});
