import { preparePlacementTerritory } from "./datacenter";
import { getPlacementBounds } from "@llmville/game/build/build";
import { cellsForBounds } from "@llmville/game/datacenter/grid";
import { v } from "convex/values";
import { isBuildItemId } from "@llmville/game/build/catalog";
import { BUILD_ERRORS } from "@llmville/game/build/buildTransition";
import {
  PICKUP_BUILD_ITEM_COMMAND,
  PLACE_BUILD_ITEM_COMMAND,
} from "@llmville/game/game/runtime/buildCommands";
import { mutation } from "./_generated/server";
import { getEditorAccess, ownerExternalIdForActor } from "./permissions";
import { runWorldCommand } from "./jgengine/world";

export const place = mutation({
  args: {
    gameId: v.id("games"),
    itemId: v.string(),
    x: v.number(),
    y: v.number(),
    z: v.number(),
    direction: v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3)),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    if (!isBuildItemId(args.itemId)) return { placed: false, reason: BUILD_ERRORS.unknownItem } as const;

    await preparePlacementTerritory(ctx, owned.game.createdBy, cellsForBounds(getPlacementBounds(args.itemId, { x: args.x, z: args.z }, args.direction)));
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      PLACE_BUILD_ITEM_COMMAND,
      {
        itemId: args.itemId,
        position: { x: args.x, y: args.y, z: args.z },
        direction: args.direction,
        now: Date.now(),
      },
    );
    if (!outcome.ok) {
      return { placed: false, reason: outcome.reason } as const;
    }
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { placed: true } as const;
  },
});

export const pickup = mutation({
  args: {
    gameId: v.id("games"),
    itemId: v.string(),
    playerX: v.number(),
    playerZ: v.number(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      PICKUP_BUILD_ITEM_COMMAND,
      { itemId: args.itemId, player: { x: args.playerX, z: args.playerZ } },
    );
    if (!outcome.ok) return { pickedUp: false, reason: outcome.reason } as const;
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { pickedUp: true } as const;
  },
});
