import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import type { EntityDiedEvent } from "@jgengine/core/game/events";

import { editorLayers } from "../../editorLayers";
import { BUILDINGS, combatantDef, DECOR, isNode, NODES } from "../catalog";
import { registerCommands } from "../commands";
import { hudStore } from "../hudStore";
import { GOLD, LUMBER, STARTING_GOLD, STARTING_LUMBER } from "../tuning";
import { initResourceField, resetSession, session, type UnitRuntime } from "../session";

const GUARD_LEASH = 16;

function markerCatalogId(marker: { catalogId?: string; meta?: unknown }): string | null {
  if (typeof marker.catalogId === "string" && marker.catalogId.length > 0) return marker.catalogId;
  const meta = marker.meta as { catalogId?: string } | undefined;
  return typeof meta?.catalogId === "string" ? meta.catalogId : null;
}

function markerPosition(marker: { position: { x: number; y?: number; z: number } }): EntityPosition {
  return [marker.position.x, marker.position.y ?? 0, marker.position.z];
}

function playerKeepPoint(): { x: number; z: number } {
  const keep = editorLayers.markers.find((m) => markerCatalogId(m) === "keep_player");
  return keep === undefined ? { x: 0, z: 36 } : { x: keep.position.x, z: keep.position.z };
}

function onDied(ctx: GameContext, event: EntityDiedEvent): void {
  session.units.delete(event.instanceId);
  const def = combatantDef(event.catalogId);
  if (def === null) return;
  if (def.id === "keep_enemy") {
    session.over = true;
    session.victory = true;
    hudStore.set({ phase: "won" });
    return;
  }
  if (def.id === "keep_player") {
    session.over = true;
    session.victory = false;
    hudStore.set({ phase: "lost" });
    return;
  }
  if (def.faction === "enemy" && def.kind === "unit" && def.bounty > 0) {
    ctx.game.economy.grant(ctx.player.userId, GOLD, def.bounty);
  }
  // A razed Farm lowers the supply cap.
  const supply = BUILDINGS[event.catalogId]?.supply;
  if (def.faction === "player" && def.kind === "building" && supply !== undefined) {
    session.supplyCap = Math.max(0, session.supplyCap - supply);
  }
}

/** Spawn the authored roster + resource nodes, wire economy + win/lose, and register the RTS commands. */
export function setupSkirmish(ctx: GameContext): void {
  resetSession();
  hudStore.reset();
  ctx.game.economy.grant(ctx.player.userId, GOLD, STARTING_GOLD);
  ctx.game.economy.grant(ctx.player.userId, LUMBER, STARTING_LUMBER);

  const rallyOnPlayer = playerKeepPoint();

  for (const marker of editorLayers.markers) {
    const catalogId = markerCatalogId(marker);
    if (catalogId === null) continue;
    const pos = markerPosition(marker);
    const def = combatantDef(catalogId);

    if (def !== null) {
      // Engine spawn role is presentation-only ("npc"); hostility is decided by faction in the AI.
      ctx.scene.entity.spawn(catalogId, { id: marker.id, position: pos, role: "npc" });
      const unit: UnitRuntime = {
        id: marker.id,
        catalogId,
        faction: def.faction,
        kind: def.kind,
        command: { kind: "idle" },
        leash: 0,
        attackCooldown: 0,
      };
      if (def.kind === "building" && def.faction === "player") {
        // Depot anchor for peasant hauling.
        unit.guardPoint = { x: pos[0], z: pos[2] };
      }
      if (def.kind === "unit" && def.faction === "enemy") {
        const stance = (marker.meta as { stance?: string } | undefined)?.stance;
        if (stance === "assault") {
          unit.command = { kind: "attackMove", x: rallyOnPlayer.x, z: rallyOnPlayer.z };
        } else {
          unit.guardPoint = { x: pos[0], z: pos[2] };
          unit.leash = GUARD_LEASH;
        }
      }
      session.units.set(marker.id, unit);
      continue;
    }

    if (isNode(catalogId)) {
      ctx.scene.entity.spawn(catalogId, { id: marker.id, position: pos, role: "npc", rotationY: marker.rotationY ?? 0 });
      session.nodes.set(marker.id, { id: marker.id, resource: NODES[catalogId]!.resource, x: pos[0], z: pos[2] });
      continue;
    }

    if (DECOR.has(catalogId)) {
      ctx.scene.entity.spawn(catalogId, { id: marker.id, position: pos, role: "npc", rotationY: marker.rotationY ?? 0 });
    }
  }

  initResourceField();
  registerCommands(ctx);
  ctx.game.events.on("entity.died", (event) => onDied(ctx, event));
}
