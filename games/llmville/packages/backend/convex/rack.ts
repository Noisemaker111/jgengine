import { v } from "convex/values";
import {
  INSTALL_RACK_COOLER_COMMAND,
  MOVE_RACK_HARDWARE_COMMAND,
  UNINSTALL_RACK_COOLER_COMMAND,
} from "@llmville/game/game/runtime/rackCommands";
import { mutation } from "./_generated/server";
import { getEditorAccess, ownerExternalIdForActor } from "./permissions";
import { runWorldCommand } from "./jgengine/world";
import { coolingUnitIdValidator, hardwareModelIdValidator } from "./schema";

const COMMAND_REASONS: Record<string, string> = {
  unknown_hardware: "Unknown hardware",
  no_stock: "Hardware not in storage",
  rack_full: "Rack is full",
  invalid_slot: "Invalid slot",
  slot_empty: "Slot is empty",
  slot_occupied: "Slot is occupied",
};

const COOLER_REASONS: Record<string, string> = {
  no_stock: "Cooler not in storage",
  incompatible: "Cooler incompatible with this rack",
  already_installed: "Rack already has a cooler",
  unknown_cooler: "Unknown cooler",
  no_cooler_installed: "No cooler installed",
};

function readableReason(reason: string, table: Record<string, string>): string {
  return table[reason] ?? reason;
}

export const moveHardware = mutation({
  args: {
    gameId: v.id("games"),
    rackId: v.string(),
    externalId: v.optional(v.string()),
    from: v.union(
      v.object({ kind: v.literal("stock"), hardwareId: hardwareModelIdValidator }),
      v.object({ kind: v.literal("slot"), slot: v.number() }),
    ),
    to: v.union(
      v.object({ kind: v.literal("stock") }),
      v.object({ kind: v.literal("slot"), slot: v.optional(v.number()) }),
    ),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      MOVE_RACK_HARDWARE_COMMAND,
      { rackInstanceId: args.rackId, from: args.from, to: args.to },
    );
    if (!outcome.ok) return { moved: false, reason: readableReason(outcome.reason, COMMAND_REASONS) };
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { moved: true };
  },
});

export const cool = mutation({
  args: {
    gameId: v.id("games"),
    rackId: v.string(),
    coolingUnitId: coolingUnitIdValidator,
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      INSTALL_RACK_COOLER_COMMAND,
      { rackInstanceId: args.rackId, coolerId: args.coolingUnitId },
    );
    if (!outcome.ok) {
      return { installed: false, reason: readableReason(outcome.reason, COOLER_REASONS) };
    }
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { installed: true };
  },
});

export const uncool = mutation({
  args: {
    gameId: v.id("games"),
    rackId: v.string(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getEditorAccess(ctx, args.gameId, args.externalId);
    const outcome = await runWorldCommand(
      ctx,
      ownerExternalIdForActor(owned.actorExternalId),
      UNINSTALL_RACK_COOLER_COMMAND,
      { rackInstanceId: args.rackId },
    );
    if (!outcome.ok) {
      return { uninstalled: false, reason: readableReason(outcome.reason, COOLER_REASONS) };
    }
    await ctx.db.patch(owned.game._id, { updatedAt: Date.now() });
    return { uninstalled: true };
  },
});
