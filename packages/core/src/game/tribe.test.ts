import { describe, expect, test } from "bun:test";

import {
  createTribe,
  createTribeRegistry,
  type TribeConfig,
  type TribeRankDef,
} from "./tribe";

const RANKS: readonly TribeRankDef[] = [
  { id: "recruit", name: "Recruit", level: 0, permissions: ["use"] },
  {
    id: "member",
    name: "Member",
    level: 1,
    permissions: ["build", "use", "inventory"],
  },
  {
    id: "officer",
    name: "Officer",
    level: 2,
    permissions: ["build", "demolish", "invite", "kick", "manage-ranks", "use", "inventory", "command"],
  },
  { id: "leader", name: "Leader", level: 3, bypass: true },
];

let clock = 0;
const now = () => ++clock;

function makeTribe(overrides: Partial<TribeConfig> = {}) {
  clock = 0;
  return createTribe({
    id: "wolves",
    founderId: "founder",
    ranks: RANKS,
    defaultRankId: "recruit",
    founderRankId: "leader",
    now,
    ...overrides,
  });
}

describe("createTribe membership & ranks", () => {
  test("founder is a member and an admin at the founder rank", () => {
    const tribe = makeTribe();
    expect(tribe.hasMember("founder")).toBe(true);
    expect(tribe.isAdmin("founder")).toBe(true);
    expect(tribe.rankOf("founder")?.id).toBe("leader");
    expect(tribe.founderId()).toBe("founder");
  });

  test("only members with invite permission can add members", () => {
    const tribe = makeTribe();
    // Founder invites an officer.
    expect(tribe.addMember("founder", "olivia", "officer")).toBeNull();
    // Officer has invite permission and can add a recruit.
    expect(tribe.addMember("olivia", "rick")).toBeNull();
    expect(tribe.rankOf("rick")?.id).toBe("recruit");
    // Recruit lacks invite permission.
    expect(tribe.addMember("rick", "nate")).toEqual({ reason: "missing invite permission" });
    // Non-member cannot act.
    expect(tribe.addMember("ghost", "nate")).toEqual({ reason: "actor is not a member" });
  });

  test("cannot invite at or above your own rank", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "olivia", "officer");
    expect(tribe.addMember("olivia", "peer", "officer")).toEqual({
      reason: "cannot invite at or above your own rank",
    });
  });

  test("promote and demote go through setMemberRank with hierarchy checks", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "olivia", "officer");
    tribe.addMember("olivia", "rick", "recruit");
    // Officer promotes recruit to member (below officer).
    expect(tribe.setMemberRank("olivia", "rick", "member")).toBeNull();
    expect(tribe.rankOf("rick")?.id).toBe("member");
    // Officer cannot promote to officer (at their own level).
    expect(tribe.setMemberRank("olivia", "rick", "officer")).toEqual({
      reason: "cannot assign a rank at or above your own",
    });
    // Recruit-turned-member cannot re-rank an officer above them.
    expect(tribe.setMemberRank("rick", "olivia", "recruit")).toEqual({
      reason: "missing manage-ranks permission",
    });
    // Demote back down.
    expect(tribe.setMemberRank("olivia", "rick", "recruit")).toBeNull();
    expect(tribe.rankOf("rick")?.id).toBe("recruit");
  });

  test("removeMember requires kick permission and outranking; founder is protected", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "olivia", "officer");
    tribe.addMember("olivia", "rick", "recruit");
    tribe.addMember("olivia", "sam", "recruit");
    // Recruit cannot kick.
    expect(tribe.removeMember("rick", "sam")).toEqual({ reason: "missing kick permission" });
    // Officer kicks a recruit.
    expect(tribe.removeMember("olivia", "sam")).toBeNull();
    expect(tribe.hasMember("sam")).toBe(false);
    // Nobody can remove the founder.
    expect(tribe.removeMember("olivia", "founder")).toEqual({ reason: "cannot remove the founder" });
    // Cannot self-remove via removeMember.
    expect(tribe.removeMember("olivia", "olivia")).toEqual({ reason: "use leave to remove yourself" });
  });

  test("founder bypass ignores permission slugs entirely", () => {
    const tribe = makeTribe();
    // Founder's leader rank has no explicit permissions but bypass grants all.
    expect(tribe.can("founder", "anything-at-all")).toBe(true);
    tribe.addMember("founder", "rick", "recruit");
    expect(tribe.can("rick", "build")).toBe(false);
    expect(tribe.can("rick", "use")).toBe(true);
  });

  test("transferFounder moves leadership and can only be done by the founder", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "olivia", "officer");
    expect(tribe.transferFounder("olivia", "founder")).toEqual({
      reason: "only the founder can transfer leadership",
    });
    expect(tribe.transferFounder("founder", "olivia")).toBeNull();
    expect(tribe.founderId()).toBe("olivia");
    expect(tribe.rankOf("olivia")?.id).toBe("leader");
    expect(tribe.isAdmin("olivia")).toBe(true);
  });
});

describe("createTribe shared vs personal ownership", () => {
  test("group assets resolve by rank permission", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "rick", "recruit");
    tribe.registerAsset("founder", { kind: "structure", id: "gate" }, { scope: "group" });
    expect(tribe.ownerOfAsset({ kind: "structure", id: "gate" })).toEqual({ scope: "group" });
    // Recruit can "use" but not "inventory" per rank permissions.
    expect(tribe.canAccess("rick", { kind: "structure", id: "gate" }, "use")).toBe(true);
    expect(tribe.canAccess("rick", { kind: "structure", id: "gate" }, "inventory")).toBe(false);
    // Non-member gets nothing.
    expect(tribe.canAccess("ghost", { kind: "structure", id: "gate" }, "use")).toBe(false);
  });

  test("personal assets are private to their owner (admins bypass)", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "rick", "member");
    tribe.addMember("founder", "sam", "member");
    tribe.registerAsset("rick", { kind: "creature", id: "wolf1" }, { scope: "personal", memberId: "rick" });
    // Owner accesses their own creature.
    expect(tribe.canAccess("rick", { kind: "creature", id: "wolf1" }, "command")).toBe(true);
    // Another member cannot, even with matching rank permissions.
    expect(tribe.canAccess("sam", { kind: "creature", id: "wolf1" }, "use")).toBe(false);
    // Founder/admin bypasses ownership.
    expect(tribe.canAccess("founder", { kind: "creature", id: "wolf1" }, "command")).toBe(true);
  });

  test("cannot register a personal asset for another member unless admin", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "rick", "member");
    tribe.addMember("founder", "sam", "member");
    expect(
      tribe.registerAsset("rick", { kind: "creature", id: "wolf2" }, { scope: "personal", memberId: "sam" }),
    ).toEqual({ reason: "cannot register assets for another member" });
    // Admin (founder) can.
    expect(
      tribe.registerAsset("founder", { kind: "creature", id: "wolf2" }, { scope: "personal", memberId: "sam" }),
    ).toBeNull();
  });

  test("group asset registration needs build permission", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "rick", "recruit");
    expect(tribe.registerAsset("rick", { kind: "structure", id: "wall" }, { scope: "group" })).toEqual({
      reason: "missing build permission",
    });
  });

  test("a leaving member keeps personal assets; group assets stay behind", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "rick", "member");
    tribe.registerAsset("rick", { kind: "creature", id: "wolf1" }, { scope: "personal", memberId: "rick" });
    tribe.registerAsset("founder", { kind: "structure", id: "hall" }, { scope: "group" });
    expect(tribe.assetsOf("rick")).toEqual([{ kind: "creature", id: "wolf1" }]);

    expect(tribe.leave("rick")).toBeNull();
    expect(tribe.hasMember("rick")).toBe(false);
    // Personal asset left the group registry (the member took it with them).
    expect(tribe.ownerOfAsset({ kind: "creature", id: "wolf1" })).toBeNull();
    // Group asset remains.
    expect(tribe.ownerOfAsset({ kind: "structure", id: "hall" })).toEqual({ scope: "group" });
  });

  test("founder cannot leave without transferring first", () => {
    const tribe = makeTribe();
    expect(tribe.leave("founder")).toEqual({ reason: "founder must transfer leadership first" });
  });

  test("kicking a member also releases their personal assets", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "sam", "member");
    tribe.registerAsset("sam", { kind: "creature", id: "boar" }, { scope: "personal", memberId: "sam" });
    expect(tribe.removeMember("founder", "sam")).toBeNull();
    expect(tribe.ownerOfAsset({ kind: "creature", id: "boar" })).toBeNull();
  });
});

describe("createTribe alliances", () => {
  test("allied tribes resolve as friendly, self is friendly, others neutral", () => {
    const tribe = makeTribe();
    expect(tribe.relationTo("wolves")).toBe("friendly");
    expect(tribe.relationTo("bears")).toBe("neutral");
    tribe.addAlly("bears");
    expect(tribe.isAllied("bears")).toBe(true);
    expect(tribe.relationTo("bears")).toBe("friendly");
    expect(tribe.allyIds()).toEqual(["bears"]);
    tribe.removeAlly("bears");
    expect(tribe.relationTo("bears")).toBe("neutral");
  });

  test("adding self as ally is a no-op", () => {
    const tribe = makeTribe();
    tribe.addAlly("wolves");
    expect(tribe.allyIds()).toEqual([]);
  });
});

describe("createTribe event log", () => {
  test("records membership, ownership, and alliance events", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "rick", "recruit");
    tribe.registerAsset("founder", { kind: "structure", id: "gate" }, { scope: "group" });
    tribe.addAlly("bears");
    const types = tribe.events().map((e) => e.type);
    expect(types).toEqual(["member-added", "asset-registered", "alliance-formed"]);
    expect(tribe.events()[0]).toMatchObject({ actor: "founder", subject: "rick", rankId: "recruit" });
  });

  test("ring buffer keeps only the most recent events up to the cap", () => {
    const tribe = makeTribe({ logCap: 3 });
    for (let i = 0; i < 10; i++) tribe.addAlly(`t${i}`);
    const events = tribe.events();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.tribeId)).toEqual(["t7", "t8", "t9"]);
    // Sequence numbers keep climbing even as old entries drop.
    expect(events.map((e) => e.seq)).toEqual([8, 9, 10]);
  });
});

describe("createTribe snapshot / hydrate", () => {
  test("round-trips through JSON with identical observable state", () => {
    const tribe = makeTribe();
    tribe.addMember("founder", "olivia", "officer");
    tribe.addMember("olivia", "rick", "member");
    tribe.registerAsset("rick", { kind: "creature", id: "wolf1" }, { scope: "personal", memberId: "rick" });
    tribe.registerAsset("founder", { kind: "structure", id: "hall" }, { scope: "group" });
    tribe.addAlly("bears");

    const json = JSON.parse(JSON.stringify(tribe.snapshot()));
    const restored = makeTribe({ id: "wolves", founderId: "founder" });
    restored.hydrate(json);

    expect(restored.memberIds().sort()).toEqual(["founder", "olivia", "rick"]);
    expect(restored.rankOf("olivia")?.id).toBe("officer");
    expect(restored.canAccess("rick", { kind: "creature", id: "wolf1" }, "command")).toBe(true);
    expect(restored.ownerOfAsset({ kind: "structure", id: "hall" })).toEqual({ scope: "group" });
    expect(restored.isAllied("bears")).toBe(true);
    expect(restored.snapshot()).toEqual(tribe.snapshot());
  });
});

describe("createTribeRegistry", () => {
  test("forms and breaks mutual alliances on both tribes", () => {
    const registry = createTribeRegistry({ now });
    registry.create({ id: "wolves", founderId: "w", ranks: RANKS, founderRankId: "leader" });
    registry.create({ id: "bears", founderId: "b", ranks: RANKS, founderRankId: "leader" });

    expect(registry.areAllied("wolves", "bears")).toBe(false);
    expect(registry.formAlliance("wolves", "bears")).toBeNull();
    expect(registry.areAllied("wolves", "bears")).toBe(true);
    expect(registry.get("wolves")?.isAllied("bears")).toBe(true);
    expect(registry.get("bears")?.isAllied("wolves")).toBe(true);
    expect(registry.relationBetweenTribes("wolves", "bears")).toBe("friendly");

    registry.breakAlliance("wolves", "bears");
    expect(registry.areAllied("wolves", "bears")).toBe(false);
  });

  test("member relations resolve friendly for same tribe and allies, neutral otherwise", () => {
    const registry = createTribeRegistry({ now });
    const wolves = registry.create({ id: "wolves", founderId: "w", ranks: RANKS, founderRankId: "leader" });
    const bears = registry.create({ id: "bears", founderId: "b", ranks: RANKS, founderRankId: "leader" });
    wolves.addMember("w", "rick", "recruit");
    bears.addMember("b", "sam", "recruit");

    expect(registry.relationBetweenMembers("w", "rick")).toBe("friendly");
    expect(registry.isFriendly("rick", "sam")).toBe(false);
    registry.formAlliance("wolves", "bears");
    expect(registry.isFriendly("rick", "sam")).toBe(true);
    // Unknown members are neutral.
    expect(registry.relationBetweenMembers("rick", "ghost")).toBe("neutral");
    expect(registry.tribeOfMember("rick")?.id).toBe("wolves");
  });

  test("removing a tribe clears dangling alliances", () => {
    const registry = createTribeRegistry({ now });
    registry.create({ id: "wolves", founderId: "w", ranks: RANKS, founderRankId: "leader" });
    registry.create({ id: "bears", founderId: "b", ranks: RANKS, founderRankId: "leader" });
    registry.formAlliance("wolves", "bears");
    registry.remove("bears");
    expect(registry.get("wolves")?.isAllied("bears")).toBe(false);
  });

  test("registry round-trips through snapshot / hydrate", () => {
    const registry = createTribeRegistry({ now });
    const wolves = registry.create({ id: "wolves", founderId: "w", ranks: RANKS, founderRankId: "leader" });
    registry.create({ id: "bears", founderId: "b", ranks: RANKS, founderRankId: "leader" });
    wolves.addMember("w", "rick", "member");
    registry.formAlliance("wolves", "bears");

    const json = JSON.parse(JSON.stringify(registry.snapshot()));
    const restored = createTribeRegistry({ now });
    restored.hydrate(json);

    expect(restored.all().map((t) => t.id).sort()).toEqual(["bears", "wolves"]);
    expect(restored.areAllied("wolves", "bears")).toBe(true);
    expect(restored.get("wolves")?.hasMember("rick")).toBe(true);
  });

  test("rejects duplicate tribe ids and self-alliances", () => {
    const registry = createTribeRegistry();
    registry.create({ id: "wolves", founderId: "w", ranks: RANKS, founderRankId: "leader" });
    expect(() => registry.create({ id: "wolves", founderId: "x", ranks: RANKS })).toThrow();
    expect(registry.formAlliance("wolves", "wolves")).toEqual({
      reason: "a tribe cannot ally with itself",
    });
  });
});
