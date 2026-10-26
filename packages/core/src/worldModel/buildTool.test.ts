import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { defineBuildKeys, placePiece } from "./buildTool";
import type { WorldPlacement } from "./worldModel";

function world(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "Build tool", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { itemById: () => undefined, entityById: () => undefined },
    player: { userId: "hero", isNew: true },
  });
}

function model(refusal: string | null) {
  const placed: { kind: string; at: WorldPlacement | undefined }[] = [];
  return {
    placed,
    canPlace: () => (refusal === null ? null : { ok: false as const, code: "cost", message: refusal }),
    place: (kind: string, at?: WorldPlacement) => {
      placed.push({ kind, at });
      return { ok: true as const, id: kind, queued: false };
    },
  };
}

const texts = (ctx: GameContext) => ctx.game.notices.list().map((notice) => `${notice.tone}:${notice.text}`);

describe("placePiece", () => {
  test("places and announces the piece", () => {
    const ctx = world();
    const target = model(null);
    expect(placePiece(ctx, target, { id: "wall", label: "Wall" }, { cell: [2, 3] })).toBe(true);
    expect(target.placed).toEqual([{ kind: "wall", at: { cell: [2, 3] } }]);
    expect(texts(ctx)).toEqual(["info:Wall going up"]);
  });

  test("says the model's refusal, or the caller's when there is no spot, and places nothing", () => {
    const ctx = world();
    const target = model("Not enough wood");
    expect(placePiece(ctx, target, { id: "wall", label: "Wall" }, { cell: [0, 0] })).toBe(false);
    expect(placePiece(ctx, target, { id: "wall", label: "Wall" }, "Build inside the camp")).toBe(false);
    expect(target.placed).toEqual([]);
    expect(texts(ctx)).toEqual(["deny:Not enough wood", "deny:Build inside the camp"]);
  });
});

describe("defineBuildKeys", () => {
  test("binds build1..buildN to the pieces in order", () => {
    const ctx = world();
    const used: string[] = [];
    defineBuildKeys(ctx, [{ id: "wall", label: "Wall" }, { id: "tower", label: "Tower" }], (_, piece) => used.push(piece.id));
    ctx.game.commands.run("build2", {});
    ctx.game.commands.run("build1", {});
    expect(used).toEqual(["tower", "wall"]);
  });
});
