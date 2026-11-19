import { createPlotPermissions, type BuildRoleLadder } from "@jgengine/core/placement/buildPermissions";
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

export function isOwner(game: Doc<"games">, actorExternalId: string): boolean {
  return game.createdBy === actorExternalId;
}

async function isGuestActor(ctx: MutationCtx | QueryCtx, actorExternalId: string): Promise<boolean> {
  if (isBotActorExternalId(actorExternalId)) return false;
  const authUser = await authComponent.safeGetAuthUser(ctx);
  return authUser?.isAnonymous === true;
}

type LabRole = "visitor" | "bot" | "owner";

const LAB_ROLES: BuildRoleLadder<LabRole> = {
  ladder: ["visitor", "bot", "owner"],
  editor: "bot",
  guildDefault: "visitor",
  everyone: "visitor",
};

async function labAccess(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games">,
  actorExternalId: string,
): Promise<{ canView: boolean; canEdit: boolean }> {
  const owner = isOwner(game, actorExternalId);
  const bot = !owner && (await botHasAccess(ctx, game, actorExternalId));
  const blocked =
    !owner &&
    !bot &&
    ((await isGuestActor(ctx, actorExternalId)) ||
      (game.bannedExternalIds ?? []).includes(ownerExternalIdForActor(actorExternalId)));
  const lab = createPlotPermissions({
    ...LAB_ROLES,
    plotId: game._id,
    ownerId: game.createdBy,
    roles: bot ? { [actorExternalId]: "bot" } : {},
    banned: blocked ? [actorExternalId] : [],
  });
  const actor = { userId: actorExternalId };
  return { canView: lab.canView(actor), canEdit: lab.canEdit(actor) };
}

export async function canRead(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games">,
  actorExternalId: string,
): Promise<boolean> {
  return (await labAccess(ctx, game, actorExternalId)).canView;
}

export async function canEdit(
  ctx: MutationCtx | QueryCtx,
  game: Doc<"games">,
  actorExternalId: string,
): Promise<boolean> {
  return (await labAccess(ctx, game, actorExternalId)).canEdit;
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

export async function getReadAccess(
  ctx: MutationCtx | QueryCtx,
  gameId: Id<"games">,
  fallbackExternalId: string | undefined,
): Promise<{ actorExternalId: string; canEdit: boolean } | null> {
  const actorExternalId = await resolveActor(ctx, fallbackExternalId);
  if (actorExternalId === null) return null;
  const game = await ctx.db.get("games", gameId);
  if (game === null) return null;
  const access = await labAccess(ctx, game, actorExternalId);
  return access.canView ? { actorExternalId, canEdit: access.canEdit } : null;
}
