import { describe, expect, test } from "bun:test";

import { createRoster } from "./roster";
import {
  createCompanionRoster,
  resolveCompanionIntent,
  type CompanionConfig,
  type CompanionRecord,
} from "./companion";

const STATS_CONFIG: CompanionConfig = {
  stats: { hp: { max: 100 }, damage: { max: 10 } },
  upgrades: { hp: { increment: 20, maxCap: 160 }, damage: { increment: 5 } },
};

function recordOf(command: CompanionRecord["command"]): CompanionRecord {
  return {
    id: "c1",
    ownerId: "hero",
    sourceId: null,
    command,
    home: [5, 0, 5],
    leash: 12,
    level: 1,
    unspentPoints: 0,
    stats: {},
  };
}

describe("createCompanionRoster", () => {
  test("adopts a companion tied to an owner and roster entry", () => {
    const roster = createRoster();
    const entry = roster.capture("hero", "wild_wolf");

    const companions = createCompanionRoster(STATS_CONFIG);
    const companion = companions.adopt("hero", { sourceId: entry.id });

    expect(companion.ownerId).toBe("hero");
    expect(companion.sourceId).toBe(entry.id);
    expect(companion.command).toBe("follow");
    expect(companion.leash).toBe(12);
    expect(companion.stats.hp).toEqual({ current: 100, max: 100, min: 0 });
    expect(companions.ownerOf(companion.id)).toBe("hero");
    expect(companions.list("hero")).toHaveLength(1);
  });

  test("scopes companions per owner and releases", () => {
    const companions = createCompanionRoster();
    const a = companions.adopt("hero");
    companions.adopt("villain");
    expect(companions.list("hero")).toHaveLength(1);
    expect(companions.list("villain")).toHaveLength(1);
    expect(companions.release(a.id)).toBe(true);
    expect(companions.get(a.id)).toBeNull();
    expect(companions.release(a.id)).toBe(false);
  });

  test("command transitions overwrite the standing order", () => {
    const companions = createCompanionRoster();
    const c = companions.adopt("hero");
    expect(companions.command(c.id, "aggressive")?.command).toBe("aggressive");
    expect(companions.command(c.id, "stay")?.command).toBe("stay");
    expect(companions.get(c.id)?.command).toBe("stay");
    expect(companions.command("missing", "follow")).toBeNull();
  });

  test("setHome and setLeash update anchor config", () => {
    const companions = createCompanionRoster();
    const c = companions.adopt("hero");
    expect(companions.setHome(c.id, [1, 2, 3])?.home).toEqual([1, 2, 3]);
    expect(companions.setHome(c.id, null)?.home).toBeNull();
    expect(companions.setLeash(c.id, 30)?.leash).toBe(30);
  });
});

describe("resolveCompanionIntent", () => {
  const ownerPosition = [1, 0, 1] as const;

  test("follow with no owner target heels to the owner", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), { ownerPosition });
    expect(intent.kind).toBe("follow");
    expect(intent.anchor).toBe("owner");
    expect(intent.leashTo).toEqual([1, 0, 1]);
    expect(intent.candidates).toEqual([]);
    expect(intent.targetId).toBeNull();
    expect(intent.leashDistance).toBe(12);
  });

  test("follow assists the owner's current target", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), { ownerPosition, ownerTargetId: "boss" });
    expect(intent.kind).toBe("assist");
    expect(intent.candidates).toEqual(["boss"]);
    expect(intent.targetId).toBe("boss");
  });

  test("stay holds at home and anchors there", () => {
    const intent = resolveCompanionIntent(recordOf("stay"), { ownerPosition, threats: ["t1"] });
    expect(intent.kind).toBe("hold");
    expect(intent.anchor).toBe("home");
    expect(intent.leashTo).toEqual([5, 0, 5]);
    expect(intent.candidates).toEqual([]);
  });

  test("stay still assists the owner's target from home", () => {
    const intent = resolveCompanionIntent(recordOf("stay"), { ownerPosition, ownerTargetId: "boss" });
    expect(intent.kind).toBe("assist");
    expect(intent.anchor).toBe("home");
    expect(intent.targetId).toBe("boss");
  });

  test("passive never engages, even with threats and an owner target", () => {
    const intent = resolveCompanionIntent(recordOf("passive"), {
      ownerPosition,
      ownerTargetId: "boss",
      threats: ["t1", "t2"],
    });
    expect(intent.kind).toBe("follow");
    expect(intent.candidates).toEqual([]);
    expect(intent.targetId).toBeNull();
  });

  test("neutral fights back nearby threats but ignores the owner's target", () => {
    const intent = resolveCompanionIntent(recordOf("neutral"), {
      ownerPosition,
      ownerTargetId: "boss",
      threats: ["t1", "t2"],
    });
    expect(intent.kind).toBe("engage");
    expect(intent.candidates).toEqual(["t1", "t2"]);
    expect(intent.targetId).toBe("t1");
  });

  test("neutral with no threats just follows", () => {
    const intent = resolveCompanionIntent(recordOf("neutral"), { ownerPosition, ownerTargetId: "boss" });
    expect(intent.kind).toBe("follow");
    expect(intent.candidates).toEqual([]);
  });

  test("aggressive engages nearby threats before the owner's target and dedupes", () => {
    const intent = resolveCompanionIntent(recordOf("aggressive"), {
      ownerPosition,
      ownerTargetId: "boss",
      threats: ["t1", "boss"],
    });
    expect(intent.kind).toBe("engage");
    expect(intent.candidates).toEqual(["t1", "boss"]);
    expect(intent.targetId).toBe("t1");
  });

  test("aggressive with only the owner's target assists it", () => {
    const intent = resolveCompanionIntent(recordOf("aggressive"), { ownerPosition, ownerTargetId: "boss" });
    expect(intent.kind).toBe("assist");
    expect(intent.candidates).toEqual(["boss"]);
    expect(intent.targetId).toBe("boss");
  });

  test("owner anchor is null when the owner position is unknown", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), {});
    expect(intent.anchor).toBe("owner");
    expect(intent.leashTo).toBeNull();
  });

  test("is deterministic for identical inputs", () => {
    const record = recordOf("aggressive");
    const context = { ownerPosition, ownerTargetId: "boss", threats: ["t1", "t2"] };
    expect(resolveCompanionIntent(record, context)).toEqual(resolveCompanionIntent(record, context));
  });

  test("resolveIntent via the roster mirrors the pure function", () => {
    const companions = createCompanionRoster();
    const c = companions.adopt("hero", { command: "aggressive" });
    companions.setHome(c.id, null);
    const context = { ownerPosition, threats: ["t1"] };
    expect(companions.resolveIntent(c.id, context)).toEqual(
      resolveCompanionIntent(companions.get(c.id)!, context),
    );
    expect(companions.resolveIntent("missing", context)).toBeNull();
  });
});

describe("companion leveling", () => {
  test("levelUp accrues one point per level by default, bounded by maxLevel", () => {
    const companions = createCompanionRoster({ ...STATS_CONFIG, maxLevel: 3 });
    const c = companions.adopt("hero");
    expect(companions.levelUp(c.id, 2)?.level).toBe(3);
    expect(companions.get(c.id)?.unspentPoints).toBe(2);
    // Already at max: no further levels or points.
    expect(companions.levelUp(c.id, 5)?.level).toBe(3);
    expect(companions.get(c.id)?.unspentPoints).toBe(2);
  });

  test("levelUp honors an injected points-per-level curve", () => {
    const companions = createCompanionRoster({ ...STATS_CONFIG, pointsPerLevel: (level) => level });
    const c = companions.adopt("hero");
    companions.levelUp(c.id, 3); // levels 2 + 3 + 4
    expect(companions.get(c.id)?.unspentPoints).toBe(9);
  });

  test("spend raises a stat's max and current, bounded by its cap", () => {
    const companions = createCompanionRoster(STATS_CONFIG);
    const c = companions.adopt("hero");
    companions.levelUp(c.id, 5);

    const ok = companions.spend(c.id, "hp");
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") {
      expect(ok.stat).toEqual({ current: 120, max: 120, min: 0 });
      expect(ok.record.unspentPoints).toBe(4);
    }

    companions.spend(c.id, "hp"); // 140
    companions.spend(c.id, "hp"); // 160 (cap)
    const capped = companions.spend(c.id, "hp"); // would be 180 > 160
    expect(capped.status).toBe("rejected");
    expect(companions.get(c.id)?.stats.hp?.max).toBe(160);
  });

  test("spend rejects unknown, un-upgradable, and unfunded stats", () => {
    const companions = createCompanionRoster(STATS_CONFIG);
    const c = companions.adopt("hero");
    expect(companions.spend(c.id, "hp").status).toBe("rejected"); // no points yet
    companions.levelUp(c.id, 1);
    expect(companions.spend(c.id, "speed").status).toBe("rejected"); // unknown stat
    expect(companions.spend("missing", "hp").status).toBe("rejected"); // unknown companion
  });
});

describe("companion serialization", () => {
  test("snapshot/hydrate round-trips through JSON without shared references", () => {
    const companions = createCompanionRoster(STATS_CONFIG);
    const c = companions.adopt("hero", { command: "aggressive", home: [2, 0, 2] });
    companions.levelUp(c.id, 3);
    companions.spend(c.id, "damage");

    const snapshot = companions.snapshot();
    const json = JSON.parse(JSON.stringify(snapshot));

    const restored = createCompanionRoster(STATS_CONFIG);
    restored.hydrate(json);

    expect(restored.get(c.id)).toEqual(companions.get(c.id));

    // Mutating the restored store must not touch the original snapshot's data.
    restored.command(c.id, "passive");
    restored.spend(c.id, "damage");
    expect(companions.get(c.id)?.command).toBe("aggressive");
    expect(snapshot[c.id]?.command).toBe("aggressive");
  });

  test("hydrate replaces the whole store", () => {
    const companions = createCompanionRoster();
    companions.adopt("hero");
    companions.hydrate({});
    expect(companions.list("hero")).toHaveLength(0);
  });
});
