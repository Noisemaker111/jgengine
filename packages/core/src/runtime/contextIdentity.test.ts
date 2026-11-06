import { expect, test } from "bun:test";

import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";

import { aliasContext, ContextMap, contextOf } from "./contextIdentity";
import { createGameContext } from "./gameContext";
import { perContext } from "./perContext";

test("a wrapper aliased to a context shares its per-context state", () => {
  const definition = defineGameDefinition({ name: "alias", assets: createAssetCatalog(), multiplayer: "off" });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  const view = new Proxy(ctx, {});
  aliasContext(view, ctx);
  expect(contextOf(view)).toBe(ctx);

  const counters = perContext((owner) => ({ owner, count: 0 }));
  counters(view).count += 1;
  expect(counters(ctx).count).toBe(1);
  expect(counters(view).owner).toBe(ctx);

  const map = new ContextMap<string>();
  map.set(view, "seeded");
  expect(map.get(ctx)).toBe("seeded");
  expect(map.delete(ctx)).toBe(true);
  expect(map.has(view)).toBe(false);
});
