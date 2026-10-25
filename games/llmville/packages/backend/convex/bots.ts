import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { importPKCS8, SignJWT } from "jose";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { BOT_NONCE_CLAIM, botActorExternalId, isBotActorExternalId, ownerFromBotActor } from "./botActor";
import { resolveActor } from "./permissions";

const insertBotRef = makeFunctionReference<
  "mutation",
  { ownerExternalId: string; name: string; tokenHash: string; tokenNonce: string },
  { name: string; createdAt: number }
>("bots:insertBot");

const updateBotTokenRef = makeFunctionReference<
  "mutation",
  { ownerExternalId: string; tokenHash: string; tokenNonce: string },
  null
>("bots:updateBotToken");

export const BOT_JWT_APPLICATION_ID = "llmville-bot";
const BOT_JWT_KEY_ID = "bot-1";
const BOT_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_BOT_NAME = "Lab Bot";

function botIssuer(): string {
  return process.env.BOT_JWT_ISSUER ?? "https://llmville.com/bot";
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateTokenNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signBotToken(botActorId: string, tokenNonce: string): Promise<string> {
  const encodedPrivateKey = process.env.BOT_JWT_PRIVATE_KEY;
  if (!encodedPrivateKey) throw new ConvexError("BOT_JWT_PRIVATE_KEY is not configured");
  const key = await importPKCS8(atob(encodedPrivateKey), "RS256");
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ [BOT_NONCE_CLAIM]: tokenNonce })
    .setProtectedHeader({ alg: "RS256", kid: BOT_JWT_KEY_ID })
    .setSubject(botActorId)
    .setIssuer(botIssuer())
    .setAudience(BOT_JWT_APPLICATION_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + BOT_TOKEN_TTL_SECONDS)
    .sign(key);
}

async function botForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerExternalId: string,
): Promise<Doc<"bots"> | null> {
  return await ctx.db
    .query("bots")
    .withIndex("by_owner_external_id", (q) => q.eq("ownerExternalId", ownerExternalId))
    .unique();
}

async function ownerGameId(
  ctx: QueryCtx | MutationCtx,
  ownerExternalId: string,
): Promise<Id<"games"> | null> {
  const worlds = await ctx.db
    .query("games")
    .withIndex("by_created_by", (q) => q.eq("createdBy", ownerExternalId))
    .collect();
  const sorted = [...worlds].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
  );
  return sorted[0]?._id ?? null;
}

export const getMyBot = query({
  args: {},
  returns: v.union(
    v.object({
      name: v.string(),
      createdAt: v.number(),
      lastSeenAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const actorExternalId = await resolveActor(ctx, undefined);
    if (!actorExternalId) return null;
    const bot = await botForOwner(ctx, actorExternalId);
    if (!bot) return null;
    return { name: bot.name, createdAt: bot.createdAt, lastSeenAt: bot.lastSeenAt ?? null };
  },
});

export const insertBot = internalMutation({
  args: { ownerExternalId: v.string(), name: v.string(), tokenHash: v.string(), tokenNonce: v.string() },
  returns: v.object({ name: v.string(), createdAt: v.number() }),
  handler: async (ctx, args) => {
    const existing = await botForOwner(ctx, args.ownerExternalId);
    if (existing) throw new ConvexError("A bot is already connected. Rotate or disconnect it first.");
    const gameId = await ownerGameId(ctx, args.ownerExternalId);
    if (!gameId) throw new ConvexError("Create a world before connecting a bot.");
    const now = Date.now();
    await ctx.db.insert("bots", {
      ownerExternalId: args.ownerExternalId,
      gameId,
      name: args.name,
      tokenHash: args.tokenHash,
      tokenNonce: args.tokenNonce,
      createdAt: now,
      updatedAt: now,
    });
    return { name: args.name, createdAt: now };
  },
});

export const updateBotToken = internalMutation({
  args: { ownerExternalId: v.string(), tokenHash: v.string(), tokenNonce: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const bot = await botForOwner(ctx, args.ownerExternalId);
    if (!bot) throw new ConvexError("No bot is connected.");
    await ctx.db.patch(bot._id, { tokenHash: args.tokenHash, tokenNonce: args.tokenNonce, updatedAt: Date.now() });
    return null;
  },
});

async function requireBotOwnerExternalId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to manage a bot.");
  const ownerExternalId = identity.subject;
  if (isBotActorExternalId(ownerExternalId)) throw new ConvexError("A bot cannot manage bots.");
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (authUser?.isAnonymous) throw new ConvexError("Guest sessions cannot own a bot. Sign in first.");
  return ownerExternalId;
}

export const connectBot = action({
  args: { name: v.optional(v.string()) },
  returns: v.object({ token: v.string(), name: v.string(), createdAt: v.number() }),
  handler: async (ctx, args) => {
    const ownerExternalId = await requireBotOwnerExternalId(ctx);
    const tokenNonce = generateTokenNonce();
    const token = await signBotToken(botActorExternalId(ownerExternalId), tokenNonce);
    const tokenHash = await sha256Hex(token);
    const name = args.name?.trim() || DEFAULT_BOT_NAME;
    const created = await ctx.runMutation(insertBotRef, {
      ownerExternalId,
      name,
      tokenHash,
      tokenNonce,
    });
    return { token, name: created.name, createdAt: created.createdAt };
  },
});

export const rotateBotToken = action({
  args: {},
  returns: v.object({ token: v.string() }),
  handler: async (ctx) => {
    const ownerExternalId = await requireBotOwnerExternalId(ctx);
    const tokenNonce = generateTokenNonce();
    const token = await signBotToken(botActorExternalId(ownerExternalId), tokenNonce);
    const tokenHash = await sha256Hex(token);
    await ctx.runMutation(updateBotTokenRef, { ownerExternalId, tokenHash, tokenNonce });
    return { token };
  },
});

async function deleteBotPresence(ctx: MutationCtx, botActorId: string): Promise<void> {
  const presences = await ctx.db
    .query("jgPoses")
    .withIndex("by_user", (q) => q.eq("userId", botActorId))
    .collect();
  for (const presence of presences) {
    await ctx.db.delete(presence._id);
  }
}

export const disconnectBot = mutation({
  args: {},
  returns: v.object({ disconnected: v.boolean() }),
  handler: async (ctx) => {
    const actorExternalId = await resolveActor(ctx, undefined);
    if (!actorExternalId) return { disconnected: false };
    const bot = await botForOwner(ctx, actorExternalId);
    if (!bot) return { disconnected: false };
    await ctx.db.delete(bot._id);
    await deleteBotPresence(ctx, botActorExternalId(actorExternalId));
    return { disconnected: true };
  },
});

export const pingBotByToken = internalMutation({
  args: { actorExternalId: v.string(), tokenHash: v.string() },
  returns: v.union(v.id("games"), v.null()),
  handler: async (ctx, args) => {
    if (!isBotActorExternalId(args.actorExternalId)) return null;
    const bot = await botForOwner(ctx, ownerFromBotActor(args.actorExternalId));
    if (!bot || bot.tokenHash !== args.tokenHash) return null;
    await ctx.db.patch(bot._id, { lastSeenAt: Date.now() });
    return bot.gameId;
  },
});
