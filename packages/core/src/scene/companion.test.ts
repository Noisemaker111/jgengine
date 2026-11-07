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

function recordOf(command: CompanionRecord["command"], stance: CompanionRecord["stance"] = "neutral"): CompanionRecord {
  return {
    id: "c1",
    ownerId: "hero",
    sourceId: null,
    command,
    stance,
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
    expect(companion.stance).toBe("neutral");
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

  test("command and stance are set apart: a staying companion keeps its stance", () => {
    const companions = createCompanionRoster();
    const c = companions.adopt("hero");
    expect(companions.stance(c.id, "aggressive")?.stance).toBe("aggressive");
    expect(companions.command(c.id, "stay")?.command).toBe("stay");
    expect(companions.get(c.id)).toMatchObject({ command: "stay", stance: "aggressive" });
    expect(companions.command("missing", "follow")).toBeNull();
    expect(companions.stance("missing", "passive")).toBeNull();
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

  test("follow with nothing to fight heels to the owner", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), { ownerPosition, nearby: ["n1"] });
    expect(intent.kind).toBe("follow");
    expect(intent.anchor).toBe("owner");
    expect(intent.leashTo).toEqual([1, 0, 1]);
    expect(intent.candidates).toEqual([]);
    expect(intent.targetId).toBeNull();
    expect(intent.leashDistance).toBe(12);
  });

  test("neutral fights back threats first, then joins the owner's fight, and leaves the merely nearby alone", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), { ownerPosition, ownerTargetId: "boss", threats: ["t1", "boss"], nearby: ["n1"] });
    expect(intent.kind).toBe("engage");
    expect(intent.candidates).toEqual(["t1", "boss"]);
    expect(intent.targetId).toBe("t1");
  });

  test("neutral with only the owner's target assists it", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), { ownerPosition, ownerTargetId: "boss" });
    expect(intent.kind).toBe("assist");
    expect(intent.targetId).toBe("boss");
  });

  test("stay holds at home, and from there still defends itself and joins the owner's fight", () => {
    expect(resolveCompanionIntent(recordOf("stay"), { ownerPosition })).toMatchObject({ kind: "hold", anchor: "home", leashTo: [5, 0, 5], candidates: [] });
    expect(resolveCompanionIntent(recordOf("stay"), { ownerPosition, threats: ["t1"] })).toMatchObject({ kind: "engage", anchor: "home", targetId: "t1" });
    expect(resolveCompanionIntent(recordOf("stay"), { ownerPosition, ownerTargetId: "boss" })).toMatchObject({ kind: "assist", anchor: "home", targetId: "boss" });
  });

  test("passive never engages, even with threats, an owner target and creatures nearby", () => {
    for (const command of ["follow", "stay"] as const) {
      const intent = resolveCompanionIntent(recordOf(command, "passive"), { ownerPosition, ownerTargetId: "boss", threats: ["t1"], nearby: ["n1"] });
      expect(intent.candidates).toEqual([]);
      expect(intent.targetId).toBeNull();
    }
  });

  test("aggressive also picks fights with the nearby, after threats and the owner's target, deduped", () => {
    const intent = resolveCompanionIntent(recordOf("follow", "aggressive"), { ownerPosition, ownerTargetId: "boss", threats: ["t1"], nearby: ["boss", "n1", "t1"] });
    expect(intent.candidates).toEqual(["t1", "boss", "n1"]);
    expect(resolveCompanionIntent(recordOf("stay", "aggressive"), { ownerPosition, nearby: ["n1"] })).toMatchObject({ kind: "engage", anchor: "home", targetId: "n1" });
  });

  test("owner anchor is null when the owner position is unknown", () => {
    const intent = resolveCompanionIntent(recordOf("follow"), {});
    expect(intent.anchor).toBe("owner");
    expect(intent.leashTo).toBeNull();
  });

  test("is deterministic for identical inputs", () => {
    const record = recordOf("follow", "aggressive");
    const context = { ownerPosition, ownerTargetId: "boss", threats: ["t1", "t2"] };
    expect(resolveCompanionIntent(record, context)).toEqual(resolveCompanionIntent(record, context));
  });

  test("resolveIntent via the roster mirrors the pure function", () => {
    const companions = createCompanionRoster();
    const c = companions.adopt("hero", { stance: "aggressive" });
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
    const c = companions.adopt("hero", { command: "stay", stance: "aggressive", home: [2, 0, 2] });
    companions.levelUp(c.id, 3);
    companions.spend(c.id, "damage");

    const snapshot = companions.snapshot();
    const json = JSON.parse(JSON.stringify(snapshot));

    const restored = createCompanionRoster(STATS_CONFIG);
    restored.hydrate(json);

    expect(restored.get(c.id)).toEqual(companions.get(c.id));

    // Mutating the restored store must not touch the original snapshot's data.
    restored.stance(c.id, "passive");
    restored.spend(c.id, "damage");
    expect(companions.get(c.id)?.stance).toBe("aggressive");
    expect(snapshot[c.id]?.stance).toBe("aggressive");
  });

  test("a record saved before stances existed hydrates as neutral", () => {
    const companions = createCompanionRoster();
    const { stance: _dropped, ...old } = recordOf("stay", "aggressive");
    companions.hydrate({ c1: old as CompanionRecord });
    expect(companions.get("c1")).toMatchObject({ command: "stay", stance: "neutral" });
  });

  test("hydrate replaces the whole store", () => {
    const companions = createCompanionRoster();
    companions.adopt("hero");
    companions.hydrate({});
    expect(companions.list("hero")).toHaveLength(0);
  });
});
