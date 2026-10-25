import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizeAvatarId } from "@llmville/game/user/founder";
import { computeUpgradeEffects } from "@llmville/game/user/personalUpgrades";
import { deriveUsernameFromEmail } from "@llmville/game/auth/loginIdentifier";
import { currencyBalances } from "./currency";
import { renameClaimOwner } from "./datacenter";

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
const AUTH_ERRORS = {
  notAuthenticated: "Not authenticated",
  userNotFound: "User not found",
} as const;

const generateRandomUsername = () => `modelmaker${Math.floor(100000 + Math.random() * 900000)}`;

export async function ensureUserRecord(ctx: MutationCtx, externalId: string, displayName: string, avatarId: string) {
  const ex = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", externalId)).first();
  const now = Date.now();
  const normalizedAvatarId = normalizeAvatarId(avatarId);
  if (ex) return await ctx.db.patch(ex._id, { displayName, avatarId: normalizedAvatarId, updatedAt: now });

  let username = generateRandomUsername();
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await ctx.db.query("users").withIndex("by_username", q => q.eq("username", username)).first())) break;
    username = generateRandomUsername();
  }
  await ctx.db.insert("users", {
    externalId,
    displayName,
    username,
    avatarId: normalizedAvatarId,
    ownedUpgrades: {},
    createdAt: now,
    updatedAt: now,
  });
}

/** The signed-in player's user row, derived from the auth token. Returns null
 * before the optimistic token has propagated or when no row exists yet. Taking
 * no externalId arg lets the client fire this the instant Convex auth is ready,
 * without waiting on the better-auth session round-trip to learn its own id. */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return null;
    return await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", id.subject)).first();
  },
});

export const clearBankruptcy = mutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) throw new Error(AUTH_ERRORS.notAuthenticated);
    const user = await ctx.db.query("users").withIndex("by_external_id", (q) => q.eq("externalId", id.subject)).first();
    if (!user) throw new Error(AUTH_ERRORS.userNotFound);
    if (user.bankruptAt === undefined) return { cleared: false as const };
    await ctx.db.patch(user._id, { bankruptAt: undefined, updatedAt: Date.now() });
    return { cleared: true as const };
  },
});

function normalizeProfileUsername(raw: string): string {
  return raw.toLowerCase().trim().replace(/^@/, "");
}

export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("users").withIndex("by_username", q => q.eq("username", normalizeProfileUsername(args.username))).first();
  },
});

export const getPublicProfileByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalizeProfileUsername(args.username)))
      .first();
    if (!user) return null;

    const worlds = await ctx.db
      .query("games")
      .withIndex("by_created_by", (q) => q.eq("createdBy", user.externalId))
      .collect();
    const world = [...worlds].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];

    if (!world) {
      return {
        username: user.username ?? null,
        displayName: user.displayName,
        avatarId: user.avatarId,
        memberSince: user.createdAt,
        lab: null,
      };
    }

    const models = await ctx.db
      .query("models")
      .withIndex("by_game_id", (q) => q.eq("gameId", world._id))
      .collect();
    const servingModels = models.filter((model) => model.launchState === "serving");
    const topBenchmark = models.reduce((best, model) => Math.max(best, model.benchmarkScore ?? 0), 0);
    const balances = await currencyBalances(ctx, world);

    return {
      username: user.username ?? null,
      displayName: user.displayName,
      avatarId: user.avatarId,
      memberSince: user.createdAt,
      lab: {
        name: world.name,
        cash: balances.money,
        dataTokens: balances.data,
        modelsTrained: models.length,
        modelsServing: servingModels.length,
        topBenchmark,
      },
    };
  },
});

export const createOrUpdate = mutation({
  args: {
    displayName: v.string(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) throw new Error(AUTH_ERRORS.notAuthenticated);
    const externalId = id.subject;
    const u = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", externalId)).first();
    const requestedUsername = args.username?.trim().toLowerCase().replace(/^@/, "");
    if (requestedUsername && !USERNAME_REGEX.test(requestedUsername)) {
      throw new Error("Invalid username");
    }
    const emailDerivedUsername =
      !requestedUsername && args.email ? deriveUsernameFromEmail(args.email) : undefined;
    const preferredUsername = requestedUsername ?? emailDerivedUsername;
    if (u) {
      const up: Record<string, unknown> = { updatedAt: Date.now() };
      if (!u.username) {
        if (preferredUsername) {
          const taken = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", preferredUsername)).first();
          if (!taken || taken._id === u._id) {
            up.username = preferredUsername;
            if (!requestedUsername) {
              up.displayName = preferredUsername;
            }
          } else {
            for (let i = 0; i < 20; i++) {
              const cand = generateRandomUsername();
              if (!(await ctx.db.query("users").withIndex("by_username", q => q.eq("username", cand)).first())) {
                up.username = cand;
                up.displayName = cand;
                break;
              }
            }
          }
        } else {
          for (let i = 0; i < 20; i++) {
            const cand = generateRandomUsername();
            if (!(await ctx.db.query("users").withIndex("by_username", q => q.eq("username", cand)).first())) { up.username = cand; break; }
          }
        }
      }
      await ctx.db.patch(u._id, up);
      return u._id;
    }
    let username = preferredUsername ?? generateRandomUsername();
    for (let i = 0; i < 20; i++) {
      if (!(await ctx.db.query("users").withIndex("by_username", q => q.eq("username", username)).first())) break;
      username = generateRandomUsername();
    }
    return await ctx.db.insert("users", {
      externalId,
      displayName: args.displayName,
      username,
      avatarId: normalizeAvatarId("sam_altman"),
      ownedUpgrades: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const isUsernameAvailable = query({
  args: { username: v.string(), excludeExternalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const norm = args.username.toLowerCase().trim();
    if (!USERNAME_REGEX.test(norm)) return false;
    const ex = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", norm)).first();
    return !ex || (args.excludeExternalId ? ex.externalId === args.excludeExternalId : false);
  },
});

export const updateProfile = mutation({
  args: { displayName: v.optional(v.string()), username: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) throw new Error(AUTH_ERRORS.notAuthenticated);
    const u = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", id.subject)).first();
    if (!u) throw new Error(AUTH_ERRORS.userNotFound);
    const up: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) {
      if (args.displayName.trim().length < 1 || args.displayName.trim().length > 32) throw new Error("Display name must be 1–32 characters");
      up.displayName = args.displayName.trim();
    }
    if (args.username !== undefined && args.username.trim().length > 0) {
      const norm = args.username.toLowerCase().trim();
      if (!USERNAME_REGEX.test(norm)) throw new Error("Username: 3–24 chars, lowercase letters, numbers, underscore only");
      const tk = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", norm)).first();
      if (tk && tk.externalId !== id.subject) throw new Error("Username is already taken");
      up.username = norm;
    }
    await ctx.db.patch(u._id, up);
    const renamed = await ctx.db.get(u._id);
    if (renamed) {
      await renameClaimOwner(ctx, renamed.externalId, renamed.username?.trim() || renamed.displayName.trim() || "Player");
    }
    return u._id;
  },
});

export const updateAvatar = mutation({
  args: { avatarId: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) throw new Error(AUTH_ERRORS.notAuthenticated);
    const u = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", id.subject)).first();
    if (!u) throw new Error(AUTH_ERRORS.userNotFound);
    await ctx.db.patch(u._id, { avatarId: normalizeAvatarId(args.avatarId), updatedAt: Date.now() });
    return u._id;
  },
});

export const getPlayerProfile = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return null;
    const u = await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", id.subject)).first();
    if (!u) return null;
    const e = computeUpgradeEffects(u);
    return {
      walkSpeedLevel: e.walkSpeedLevel,
      trainingDurationMultiplier: e.trainingDurationMultiplier,
      powerCapacityKw: e.powerCapacityKw,
    };
  },
});
