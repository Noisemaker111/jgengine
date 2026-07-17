import { describe, expect, test } from "bun:test";

import {
  allocateRewards,
  filterOutcomeFor,
  resolveClaim,
  type AllocationRequest,
  type ClaimablePool,
  type RewardRecipient,
  type RewardResult,
} from "./rewardAllocation";

const RECIPIENTS: RewardRecipient[] = [
  { id: "alice" },
  { id: "bob" },
  { id: "carol" },
];

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("allocateRewards — copy-to-all", () => {
  test("every eligible recipient receives a full copy of every result", () => {
    const results: RewardResult[] = [{ id: "sword", count: 1 }, { id: "gold", count: 50 }];
    const { grants } = allocateRewards("copy", { recipients: RECIPIENTS, allocationSeed: "s", results });
    expect(grants).toHaveLength(6);
    for (const r of RECIPIENTS) {
      expect(grants.filter((g) => g.recipient === r.id).map((g) => g.result).sort()).toEqual(["gold", "sword"]);
    }
    expect(grants.find((g) => g.recipient === "alice" && g.result === "gold")?.count).toBe(50);
  });
});

describe("allocateRewards — shared split", () => {
  test("splits a count across recipients and conserves the total", () => {
    const { grants } = allocateRewards("shared", {
      recipients: RECIPIENTS,
      allocationSeed: "s",
      results: [{ id: "gold", count: 100 }],
    });
    const total = grants.reduce((sum, g) => sum + g.count, 0);
    expect(total).toBe(100);
    // 100 / 3 → largest remainder gives one recipient 34, others 33.
    expect(grants.map((g) => g.count).sort()).toEqual([33, 33, 34]);
  });

  test("honors recipient weights", () => {
    const weighted: RewardRecipient[] = [
      { id: "alice", weight: 3 },
      { id: "bob", weight: 1 },
    ];
    const { grants } = allocateRewards("shared", {
      recipients: weighted,
      allocationSeed: "s",
      results: [{ id: "gold", count: 100 }],
    });
    expect(grants.find((g) => g.recipient === "alice")?.count).toBe(75);
    expect(grants.find((g) => g.recipient === "bob")?.count).toBe(25);
  });
});

describe("allocateRewards — round-robin", () => {
  test("distributes distinct results one per recipient in rotation", () => {
    const results: RewardResult[] = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const { grants } = allocateRewards("roundRobin", { recipients: RECIPIENTS, allocationSeed: "s", results });
    expect(grants).toHaveLength(4);
    // 3 recipients, 4 results → one recipient gets two, spread by rotation index.
    const counts = new Map<string, number>();
    for (const g of grants) counts.set(g.recipient, (counts.get(g.recipient) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([1, 1, 2]);
  });
});

describe("allocateRewards — instanced per-recipient generation", () => {
  test("each recipient rolls independent results from a stable per-id stream", () => {
    const request: AllocationRequest = {
      recipients: RECIPIENTS,
      allocationSeed: "alloc",
      generationSeed: "gen",
      generate: (rng, recipient) => [{ id: `${recipient.id}:${Math.floor(rng() * 1000)}` }],
    };
    const first = allocateRewards("instanced", request);
    const second = allocateRewards("instanced", request);
    expect(first.grants).toEqual(second.grants);
    expect(first.grants).toHaveLength(3);
    // instanced rewards are private by default.
    expect(first.grants.every((g) => g.private)).toBe(true);
  });

  test("adding a late joiner does not perturb existing recipients' rolls", () => {
    const generate = (rng: () => number, recipient: RewardRecipient): RewardResult[] => [
      { id: `${recipient.id}:${Math.floor(rng() * 1_000_000)}` },
    ];
    const before = allocateRewards("instanced", {
      recipients: [{ id: "alice" }, { id: "bob" }],
      allocationSeed: "alloc",
      generationSeed: "gen",
      generate,
    });
    const after = allocateRewards("instanced", {
      recipients: [{ id: "alice" }, { id: "bob" }, { id: "zoe" }],
      allocationSeed: "alloc",
      generationSeed: "gen",
      generate,
    });
    const pick = (grants: typeof before.grants, id: string) => grants.find((g) => g.recipient === id)?.result;
    expect(pick(after.grants, "alice")).toBe(pick(before.grants, "alice"));
    expect(pick(after.grants, "bob")).toBe(pick(before.grants, "bob"));
  });
});

describe("allocateRewards — caller-defined assignment", () => {
  test("grants exactly the mapped result ids", () => {
    const results: RewardResult[] = [{ id: "helm" }, { id: "boots", count: 2 }];
    const { grants } = allocateRewards("assigned", {
      recipients: RECIPIENTS,
      allocationSeed: "s",
      results,
      assignment: { alice: ["helm"], bob: ["boots"] },
    });
    expect(grants).toHaveLength(2);
    expect(grants.find((g) => g.recipient === "alice")?.result).toBe("helm");
    expect(grants.find((g) => g.recipient === "bob")?.count).toBe(2);
  });

  test("rejects assignment of an unknown result", () => {
    expect(() =>
      allocateRewards("assigned", {
        recipients: RECIPIENTS,
        allocationSeed: "s",
        results: [{ id: "helm" }],
        assignment: { alice: ["ghost"] },
      }),
    ).toThrow(/unknown result/);
  });
});

describe("eligibility", () => {
  test("ineligible recipients receive nothing", () => {
    const recipients: RewardRecipient[] = [{ id: "alice" }, { id: "bob", eligible: false }];
    const { grants } = allocateRewards("copy", {
      recipients,
      allocationSeed: "s",
      results: [{ id: "gold", count: 10 }],
    });
    expect(grants.map((g) => g.recipient)).toEqual(["alice"]);
  });
});

describe("determinism across simulated peers", () => {
  test("shuffled recipient order yields byte-identical outcomes for shared, round-robin, and instanced", () => {
    const results: RewardResult[] = [{ id: "gold", count: 100 }, { id: "gem", count: 7 }];
    const base = { allocationSeed: "match-42", generationSeed: "gen-42" } as const;
    for (const kind of ["shared", "roundRobin"] as const) {
      const host = allocateRewards(kind, { ...base, recipients: RECIPIENTS, results });
      for (let peer = 1; peer <= 4; peer++) {
        const outcome = allocateRewards(kind, { ...base, recipients: shuffled(RECIPIENTS, peer), results });
        expect(outcome).toEqual(host);
      }
    }
    const generate = (rng: () => number, r: RewardRecipient): RewardResult[] => [{ id: `${r.id}:${rng()}` }];
    const host = allocateRewards("instanced", { ...base, recipients: RECIPIENTS, generate });
    for (let peer = 1; peer <= 4; peer++) {
      const outcome = allocateRewards("instanced", { ...base, recipients: shuffled(RECIPIENTS, peer), generate });
      // Grant sets are identical as sorted collections regardless of join order.
      expect([...outcome.grants].sort((a, b) => (a.recipient < b.recipient ? -1 : 1))).toEqual(
        [...host.grants].sort((a, b) => (a.recipient < b.recipient ? -1 : 1)),
      );
    }
  });

  test("different allocation seeds can shift the shared remainder recipient", () => {
    const outcomes = new Set<string>();
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const { grants } = allocateRewards("shared", {
        recipients: RECIPIENTS,
        allocationSeed: seed,
        results: [{ id: "gold", count: 100 }],
      });
      const winner = grants.find((g) => g.count === 34)?.recipient ?? "";
      outcomes.add(winner);
    }
    // Seed influences tie-break: at least one seed differs from the others.
    expect(outcomes.size).toBeGreaterThan(1);
  });
});

describe("serialization round-trip", () => {
  test("outcomes and pools survive JSON round-trip unchanged", () => {
    const outcome = allocateRewards("claimed", {
      recipients: RECIPIENTS,
      allocationSeed: "s",
      results: [{ id: "chest", count: 1 }],
      claim: { mode: "first", expiresAtMs: 5000 },
    });
    const round = JSON.parse(JSON.stringify(outcome));
    expect(round).toEqual(outcome);
    // Re-resolving a deserialized pool behaves identically.
    const claimed = resolveClaim(round.pools[0] as ClaimablePool, "alice", { nowMs: 1000 });
    expect(claimed.grants).toHaveLength(1);
    expect(claimed.pool.claimedBy).toBe("alice");
  });
});

describe("claimed pools", () => {
  const request: AllocationRequest = {
    recipients: RECIPIENTS,
    allocationSeed: "s",
    results: [{ id: "chest", count: 1 }],
  };

  test("first-come claim grants once and is idempotent for the winner", () => {
    const [pool] = allocateRewards("claimed", { ...request, claim: { mode: "first" } }).pools;
    const first = resolveClaim(pool, "bob");
    expect(first.grants).toHaveLength(1);
    expect(first.pool.claimedBy).toBe("bob");
    // Re-claim by the same winner returns the same grants without double-awarding.
    const again = resolveClaim(first.pool, "bob");
    expect(again.grants).toEqual(first.grants);
    expect(again.pool.claimedBy).toBe("bob");
    // A losing claimant gets nothing.
    const loser = resolveClaim(first.pool, "carol");
    expect(loser.grants).toHaveLength(0);
    expect(loser.pool.claimedBy).toBe("bob");
  });

  test("reserved pool only grants to its owner and picks deterministically", () => {
    const a = allocateRewards("claimed", { ...request, claim: { mode: "reserved" } }).pools[0];
    const b = allocateRewards("claimed", { ...request, claim: { mode: "reserved" } }).pools[0];
    expect(a.reservedFor).toBe(b.reservedFor);
    expect(a.reservedFor).not.toBeNull();
    const owner = a.reservedFor as string;
    const other = RECIPIENTS.map((r) => r.id).find((id) => id !== owner) as string;
    expect(resolveClaim(a, other).grants).toHaveLength(0);
    expect(resolveClaim(a, owner).grants).toHaveLength(1);
  });

  test("caller-named reservation is honored", () => {
    const [pool] = allocateRewards("claimed", {
      ...request,
      claim: { mode: "reserved", reservedFor: "carol" },
    }).pools;
    expect(pool.reservedFor).toBe("carol");
    expect(resolveClaim(pool, "alice").grants).toHaveLength(0);
    expect(resolveClaim(pool, "carol").grants).toHaveLength(1);
  });

  test("expired pools reject claims", () => {
    const [pool] = allocateRewards("claimed", {
      ...request,
      claim: { mode: "first", expiresAtMs: 1000 },
    }).pools;
    expect(resolveClaim(pool, "alice", { nowMs: 2000 }).grants).toHaveLength(0);
    expect(resolveClaim(pool, "alice", { nowMs: 500 }).grants).toHaveLength(1);
  });
});

describe("replication filter", () => {
  test("private grants only reach their owner; others' are dropped, own provenance preserved", () => {
    const outcome = allocateRewards("instanced", {
      recipients: RECIPIENTS,
      allocationSeed: "s",
      generationSeed: "g",
      generate: (_rng, r) => [{ id: `loot:${r.id}` }],
    });
    const forAlice = filterOutcomeFor(outcome, "alice");
    expect(forAlice.grants).toHaveLength(1);
    expect(forAlice.grants[0].recipient).toBe("alice");
    expect(forAlice.grants[0].via).toBe("instanced");
  });

  test("public grants reach everyone", () => {
    const outcome = allocateRewards("copy", {
      recipients: RECIPIENTS,
      allocationSeed: "s",
      results: [{ id: "banner" }],
    });
    expect(filterOutcomeFor(outcome, "bob").grants.some((g) => g.recipient === "alice")).toBe(true);
  });

  test("reserved pools are hidden from non-owners", () => {
    const outcome = allocateRewards("claimed", {
      recipients: RECIPIENTS,
      allocationSeed: "s",
      results: [{ id: "quest-reward" }],
      claim: { mode: "reserved", reservedFor: "carol" },
    });
    expect(filterOutcomeFor(outcome, "alice").pools).toHaveLength(0);
    expect(filterOutcomeFor(outcome, "carol").pools).toHaveLength(1);
  });
});

describe("non-loot reward distribution", () => {
  test("distributes XP as a shared, contribution-weighted split (no item semantics)", () => {
    const party: RewardRecipient[] = [
      { id: "tank", weight: 2 },
      { id: "dps", weight: 5 },
      { id: "healer", weight: 3 },
    ];
    const { grants } = allocateRewards("shared", {
      recipients: party,
      allocationSeed: "encounter-7",
      results: [{ id: "xp", count: 1000 }],
    });
    expect(grants.reduce((sum, g) => sum + g.count, 0)).toBe(1000);
    expect(grants.find((g) => g.recipient === "dps")?.count).toBe(500);
    expect(grants.find((g) => g.recipient === "tank")?.count).toBe(200);
    expect(grants.find((g) => g.recipient === "healer")?.count).toBe(300);
  });
});
