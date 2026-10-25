import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { BOT_NONCE_CLAIM, isBotActorExternalId, ownerFromBotActor } from "./botActor";

/** Skip re-writing bots.lastSeenAt unless it is at least this stale. */
const BOT_LAST_SEEN_BUMP_MS = 30 * 1000;

function isMutationCtx(ctx: MutationCtx | QueryCtx): ctx is MutationCtx {
  return "insert" in ctx.db;
}

/** The owner external id behind an actor — a bot maps to its owner. */
export function ownerExternalIdForActor(actorExternalId: string): string {
  return isBotActorExternalId(actorExternalId) ? ownerFromBotActor(actorExternalId) : actorExternalId;
}

async function bumpBotLastSeen(ctx: MutationCtx, bot: Doc<"bots">): Promise<void> {
  const now = Date.now();
  if (bot.lastSeenAt !== undefined && now - bot.lastSeenAt < BOT_LAST_SEEN_BUMP_MS) return;
  await ctx.db.patch(bot._id, { lastSeenAt: now });
}

async function botHasAccess(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games">,
  actorExternalId: string,
): Promise<boolean> {
  if (!isBotActorExternalId(actorExternalId)) return false;
  const ownerExternalId = ownerFromBotActor(actorExternalId);
  if (ownerExternalId !== game.createdBy) return false;
  const bot = await ctx.db
    .query("bots")
    .withIndex("by_owner_external_id", (q) => q.eq("ownerExternalId", ownerExternalId))
    .unique();
  if (bot === null || bot.gameId !== game._id) return false;
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || identity.subject !== actorExternalId) return false;
  if (identity[BOT_NONCE_CLAIM] !== bot.tokenNonce) return false;
  if (isMutationCtx(ctx)) await bumpBotLastSeen(ctx, bot);
  return true;
}

interface AuthContext {
  auth: {
    getUserIdentity: () => Promise<{ subject: string } | null>;
  };
}

/**
 * Resolves the authenticated actor's external ID.
 *
 * `fallbackExternalId` is only a client-supplied hint (used for cache-busting
 * diagnostics); the JWT subject is always authoritative. A stale or mismatched
 * hint must NOT lock the player out of their own lab — it previously returned
 * null, which every caller turned into "Unauthorized" and which players
 * experienced as "can't build because of permissions". Ignore mismatches.
 */
export async function resolveActor(
  ctx: AuthContext,
  _fallbackExternalId: string | undefined,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return identity.subject;
}

/**
 * Returns true if the actor owns the game.
 */
export function isOwner(game: Doc<"games">, actorExternalId: string): boolean {
  return game.createdBy === actorExternalId;
}

async function isGuestActor(ctx: MutationCtx | QueryCtx, actorExternalId: string): Promise<boolean> {
  if (isBotActorExternalId(actorExternalId)) return false;
  const authUser = await authComponent.safeGetAuthUser(ctx);
  return authUser?.isAnonymous === true;
}

/**
 * Returns true if the actor can read the game: the owner, the owner's connected
 * bot, or any signed-in non-banned visitor — everyone shares the one world.
 */
export async function canRead(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games">,
  actorExternalId: string,
): Promise<boolean> {
  if (isOwner(game, actorExternalId)) return true;
  if (await botHasAccess(ctx, game, actorExternalId)) return true;
  if (await isGuestActor(ctx, actorExternalId)) return false;
  return !(game.bannedExternalIds ?? []).includes(ownerExternalIdForActor(actorExternalId));
}

/**
 * Returns true if the actor can edit the game: the owner, or the owner's
 * currently connected bot presenting its current token.
 */
export async function canEdit(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games">,
  actorExternalId: string,
): Promise<boolean> {
  return isOwner(game, actorExternalId) || (await botHasAccess(ctx, game, actorExternalId));
}

const UNAUTHORIZED = "Unauthorized";

/**
 * Requires ownership. Throws when the actor is missing or cannot own this game.
 */
export async function getOwnerAccess(
  ctx: MutationCtx,
  gameId: Id<"games">,
  fallbackExternalId: string | undefined,
): Promise<{ game: Doc<"games">; actorExternalId: string }> {
  const actorExternalId = await resolveActor(ctx, fallbackExternalId);
  if (actorExternalId === null) throw new ConvexError(UNAUTHORIZED);
  const game = await ctx.db.get("games", gameId);
  if (game === null || !isOwner(game, actorExternalId)) throw new ConvexError(UNAUTHORIZED);
  return { game, actorExternalId };
}

/**
 * Requires edit access (owner or the owner's connected bot). Throws when access is denied.
 */
export async function getEditorAccess(
  ctx: MutationCtx,
  gameId: Id<"games">,
  fallbackExternalId: string | undefined,
): Promise<{ game: Doc<"games">; actorExternalId: string }> {
  const actorExternalId = await resolveActor(ctx, fallbackExternalId);
  if (actorExternalId === null) throw new ConvexError(UNAUTHORIZED);
  const game = await ctx.db.get("games", gameId);
  if (game === null || !(await canEdit(ctx, game, actorExternalId))) throw new ConvexError(UNAUTHORIZED);
  return { game, actorExternalId };
}

/**
 * Gets read access without exposing the loaded game. Returns actorExternalId + canEdit or null.
 * Visitors read with canEdit false.
 */
export async function getReadAccess(
  ctx: MutationCtx | QueryCtx,
  gameId: Id<"games">,
  fallbackExternalId: string | undefined,
): Promise<{ actorExternalId: string; canEdit: boolean } | null> {
  const actorExternalId = await resolveActor(ctx, fallbackExternalId);
  if (actorExternalId === null) return null;
  const game = await ctx.db.get("games", gameId);
  if (game === null || !(await canRead(ctx, game, actorExternalId))) return null;
  return { actorExternalId, canEdit: await canEdit(ctx, game, actorExternalId) };
}
