import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { editorLayers } from "../../editorLayers";
import { BUILDINGS, combatantDef, DECOR, isNode, NODES } from "../catalog";
import { flushCampaign, failCampaignOnKeepLost, noteCampaignDeath, resetCampaignProgress, setCampaignMode, startCampaignMission, syncCampaignHud } from "../campaign";
import { grantHeroXp, heroXpFor } from "../hero";
import { loadHeroPicks } from "../heroActs";
import { registerCommands } from "../commands";
import { hudStore } from "../hudStore";
import { GOLD, LUMBER, STARTING_GOLD, STARTING_LUMBER } from "../tuning";
import { initResourceField, resetSession, session, type UnitRuntime } from "../session";
import { recordOutcome } from "../preferences";

const wiredContexts = new WeakSet<GameContext>();

/** Retained id of the hall drone (sound id `bed` in audio.ts); live at full gain, silent while paused. */
const BED_LOOP = "bed";

const GUARD_LEASH = 16;

function markerCatalogId(marker: { catalogId?: string; meta?: unknown }): string | null {
  if (typeof marker.catalogId === "string" && marker.catalogId.length > 0) return marker.catalogId;
  const meta = marker.meta as { catalogId?: string } | undefined;
  return typeof meta?.catalogId === "string" ? meta.catalogId : null;
}

function markerPosition(marker: { position: { x: number; y?: number; z: number } }): EntityPosition {
  return [marker.position.x, marker.position.y ?? 0, marker.position.z];
}

export function playerKeepPoint(): { x: number; z: number } {
  const keep = editorLayers.markers.find((m) => markerCatalogId(m) === "keep_player");
  return keep === undefined ? { x: 0, z: 36 } : { x: keep.position.x, z: keep.position.z };
}

function onDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (session.over) return;
  session.units.delete(event.instanceId);
  const def = combatantDef(event.catalogId);
  if (def === null) return;
  noteCampaignDeath(ctx, event.catalogId);
  if (def.id === "keep_enemy") {
    session.over = true;
    session.victory = true;
    hudStore.set({ phase: "won" });
    recordOutcome(ctx, true, session.elapsed);
    ctx.time.pause();
    setGamePhase(ctx, "ended");
    ctx.game.audio.stopLoop(BED_LOOP);
    ctx.game.audio.play("victory");
    // The finale's last objective is the Warcamp falling; the clock is already stopped, so the
    // machine is flushed with a zero tick instead of waiting for a frame that will not run.
    flushCampaign(ctx);
    return;
  }
  if (def.id === "keep_player") {
    // A lost keep ends the skirmish; a campaign mission lands in its named fail state first.
    failCampaignOnKeepLost(ctx);
    session.over = true;
    session.victory = false;
    hudStore.set({ phase: "lost" });
    recordOutcome(ctx, false, session.elapsed);
    ctx.time.pause();
    setGamePhase(ctx, "ended");
    ctx.game.audio.stopLoop(BED_LOOP);
    ctx.game.audio.play("defeat");
    return;
  }
  ctx.game.audio.play("fall", event.position);
  if (def.faction === "enemy" && def.kind === "unit") {
    if (def.bounty > 0) ctx.game.economy.grant(ctx.player.userId, GOLD, def.bounty);
    grantHeroXp(ctx, heroXpFor(event.catalogId)); // the hero champions the kill
  }
  // A razed Farm lowers the supply cap.
  const supply = BUILDINGS[event.catalogId]?.supply;
  if (def.faction === "player" && def.kind === "building" && supply !== undefined) {
    session.supplyCap = Math.max(0, session.supplyCap - supply);
  }
}

/** The opening instruction, held long enough to read before the first order lands. */
export const OPENING_NOTICE = "Select your workers and right-click a gold seam or logging camp.";
const OPENING_NOTICE_MS = 12_000;

/** Spawn the authored roster + resource nodes, wire economy + win/lose, and register the RTS commands. */
export function setupSkirmish(ctx: GameContext): void {
  for (const entity of ctx.scene.entity.list()) ctx.scene.entity.despawn(entity.id);
  for (const resource of [GOLD, LUMBER]) {
    const amount = ctx.game.economy.balance(ctx.player.userId, resource);
    if (amount > 0) ctx.game.economy.charge(ctx.player.userId, resource, amount);
  }
  resetSession();
  session.started = false;
  hudStore.reset();
  hudStore.set({ phase: "ready", gold: STARTING_GOLD, lumber: STARTING_LUMBER });
  // The field desk always has an offer: the next campaign mission, or nothing in a free skirmish.
  syncCampaignHud(ctx);
  setGamePhase(ctx, "menu");
  ctx.time.pause();
  ctx.game.audio.stopLoop(BED_LOOP);
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
      if (def.kind === "building") {
        // Every building carries a guard point: for the player it is the peasants' depot anchor, and
        // for the Marauders it is the camp a wave musters from (the director reads `guardPoint`).
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

  initResourceField(ctx.rng);
  // The kit a previous battle carried is restored for this one; `loadHeroPicks` is idempotent.
  loadHeroPicks(ctx);
  if (wiredContexts.has(ctx)) { syncCampaignHud(ctx); return; }
  wiredContexts.add(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("match.start", { apply: (state) => {
    if (!session.started && !session.over) {
      session.started = true;
      hudStore.set({ phase: "playing" });
      setGamePhase(state, "playing");
      state.game.notices.push({ text: OPENING_NOTICE, ttlMs: OPENING_NOTICE_MS });
      state.time.play();
      state.game.audio.loop("bed", "bed");
      state.game.audio.setLoop(BED_LOOP, { gain: 1 });
      // The campaign's next mission opens with the match; a free skirmish starts bare.
      startCampaignMission(state);
    }
    return state;
  } });
  ctx.game.commands.define("match.pause", { apply: (state) => {
    if (session.started && !session.over) {
      session.paused = true;
      hudStore.set({ phase: "paused" });
      setGamePhase(state, "paused");
      state.time.pause();
      state.game.audio.setLoop(BED_LOOP, { gain: 0 });
    }
    return state;
  } });
  ctx.game.commands.define("match.resume", { apply: (state) => {
    if (session.started && !session.over) {
      session.paused = false;
      hudStore.set({ phase: "playing" });
      setGamePhase(state, "playing");
      state.time.play();
      state.game.audio.setLoop(BED_LOOP, { gain: 1 });
    }
    return state;
  } });
  ctx.game.commands.define("match.restart", { apply: (state) => {
    setupSkirmish(state);
    state.game.commands.run("match.start", {});
    return state;
  } });
  ctx.game.commands.define("match.title", { apply: (state) => { setupSkirmish(state); return state; } });
  // Field desk: run the vale without the campaign track, or start the campaign over from mission I.
  ctx.game.commands.define("match.skirmish", { apply: (state) => {
    setCampaignMode(state, "skirmish");
    setupSkirmish(state);
    state.game.commands.run("match.start", {});
    return state;
  } });
  ctx.game.commands.define("campaign.reset", { apply: (state) => {
    setCampaignMode(state, "campaign");
    resetCampaignProgress(state);
    setupSkirmish(state);
    return state;
  } });
  ctx.game.events.on("entity.died", (event) => onDied(ctx, event));
}
