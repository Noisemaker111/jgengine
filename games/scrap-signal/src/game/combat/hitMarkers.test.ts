import { afterEach, describe, expect, test } from "bun:test";
import { createHitMarkers, hitMarkerKindOf, isLocalSource } from "@jgengine/core/combat/hitMarker";
import type { DamageAppliedEvent } from "@jgengine/core/game/events";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { seededRng } from "@jgengine/core/random/rng";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { impactDecalKindFor } from "@jgengine/core/vfx/impactDecals";

import { resetCharacterState } from "../characters";
import { content } from "../content";
import { playerDef } from "../entities/players/catalog";
import { applyDot, gunById, rollGun, tickDots } from "../handroll";
import { inventories } from "../inventories";
import { resolveGunHit, syncCombatTargets } from "./hitModel";
import { SCRAP_DECALS, SCRAP_HIT_MARKER } from "./impactLook";

afterEach(() => resetCharacterState());

function world(): { ctx: GameContext; seen: DamageAppliedEvent[] } {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-hit-markers-test", assets: createAssetCatalog(), multiplayer: "off", inventories }),
    content,
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn(playerDef.id, { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.spawn("loader", { id: "bot", position: [0, 0, 6], role: "enemy" });
  syncCombatTargets(ctx);
  const seen: DamageAppliedEvent[] = [];
  ctx.game.events.on("combat.damage", (event) => seen.push(event));
  return { ctx, seen };
}

const pistol = () => gunById(rollGun(seededRng("marker-pistol"), 1, { family: "pistol" }).id)!;

describe("scrap hit markers", () => {
  test("a gun crit reaches the damage announcement, so the crosshair marks it amber", () => {
    const { ctx, seen } = world();
    const gun = pistol();
    const plain = resolveGunHit(ctx, gun, "p1", "bot", 0, {});
    const crit = resolveGunHit(ctx, gun, "p1", "bot", 0, { forceCrit: true });
    expect(plain.crit).toBe(false);
    expect(crit.crit).toBe(true);
    const mine = (id: string) => isLocalSource(ctx, id);
    expect(seen.map((event) => hitMarkerKindOf(event, mine))).toEqual(["hit", "crit"]);
  });

  test("an elemental burn ticks as a status, not a stream of hit markers", () => {
    const { ctx, seen } = world();
    applyDot(ctx, pistol(), "p1", "bot");
    for (let i = 0; i < 90; i += 1) tickDots(ctx, 1 / 60);
    expect(seen.length).toBeGreaterThan(0);
    const markers = createHitMarkers(SCRAP_HIT_MARKER, (id) => isLocalSource(ctx, id));
    for (const event of seen) {
      expect(event.status).toBeDefined();
      expect(markers.observe(event, 0)).toBeNull();
    }
  });

  test("an armoured robot bleeds oil under the shot; flesh stays clean; blasts scorch", () => {
    expect(impactDecalKindFor(SCRAP_DECALS.surfaces, { targetKind: "entity", catalogId: "loader" })).toBe("oil");
    expect(impactDecalKindFor(SCRAP_DECALS.surfaces, { targetKind: "entity", catalogId: "husk" })).toBeNull();
    expect(impactDecalKindFor(SCRAP_DECALS.surfaces, { targetKind: "terrain", impact: "light" })).toBe("dust");
    expect(impactDecalKindFor(SCRAP_DECALS.surfaces, { targetKind: "object", catalogId: "rock_spire" })).toBe("rock");
    expect(impactDecalKindFor(SCRAP_DECALS.surfaces, { targetKind: "object", catalogId: "vendor_rigg" })).toBeNull();
    expect(impactDecalKindFor(SCRAP_DECALS.surfaces, { targetKind: "terrain", impact: "explosive" })).toBe("scorch");
    for (const kind of Object.values(SCRAP_DECALS.surfaces.catalog ?? {})) {
      if (kind !== null) expect(SCRAP_DECALS.kinds[kind]).toBeDefined();
    }
  });
});
