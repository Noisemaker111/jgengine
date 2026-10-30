import { describe, expect, mock, test } from "bun:test";

let anonymous = false;
mock.module("./auth", () => ({
  authComponent: { safeGetAuthUser: async () => ({ isAnonymous: anonymous }) },
}));

const { canEdit, canRead } = await import("./permissions");
const { BOT_NONCE_CLAIM, botActorExternalId } = await import("./botActor");

type Ctx = Parameters<typeof canRead>[0];
type Game = Parameters<typeof canRead>[1];

const game = { _id: "lab1", createdBy: "ann", bannedExternalIds: ["mal"] } as unknown as Game; // type-escape: a fake Convex document

function ctxFor(subject: string, nonce?: string): Ctx {
  const bot = { _id: "b1", gameId: "lab1", ownerExternalId: "ann", tokenNonce: "n1", lastSeenAt: Date.now() };
  const fake = {
    auth: { getUserIdentity: async () => ({ subject, [BOT_NONCE_CLAIM]: nonce }) },
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => bot }) }),
      insert: async () => "",
      patch: async () => undefined,
    },
  };
  return fake as unknown as Ctx; // type-escape: a fake Convex context
}

async function access(actor: string, nonce?: string): Promise<[boolean, boolean]> {
  const ctx = ctxFor(actor, nonce);
  return [await canRead(ctx, game, actor), await canEdit(ctx, game, actor)];
}

describe("lab access", () => {
  test("the owner and the owner's live bot build, visitors look, guests and the banned get nothing", async () => {
    anonymous = false;
    expect(await access("ann")).toEqual([true, true]);
    expect(await access(botActorExternalId("ann"), "n1")).toEqual([true, true]);
    expect(await access(botActorExternalId("ann"), "stale")).toEqual([true, false]);
    expect(await access("bob")).toEqual([true, false]);
    expect(await access("mal")).toEqual([false, false]);
    expect(await access(botActorExternalId("mal"))).toEqual([false, false]);
    anonymous = true;
    expect(await access("guest")).toEqual([false, false]);
    expect(await access("ann")).toEqual([true, true]);
  });
});
