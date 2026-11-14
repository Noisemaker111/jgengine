import { defineSystem, type SystemDefinition } from "@jgengine/core/game/defineSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { activeJobs, jobProgress, queuedJobs, tick as tickQueue } from "@jgengine/core/gameplay";

import { tickUnits } from "./ai/units";
import { tickTowers } from "./ai/towers";
import { nextWaveEta, planPhase, tickEnemyWaves } from "./ai/director";
import { noteCampaignBuild, noteCampaignTrain, tickCampaign, campaignWavesRunning } from "./campaign";
import { setupSkirmish } from "./world/scene";
import { enemyDrawn, refreshSight, sightRadiusFor, type SightSource } from "./fog";
import { holdFormation } from "./formations";
import { heroLevel } from "./hero";
import { heroActViews, carriedHeroPicks, pendingHeroOffer, tickHero } from "./heroActs";
import { buildingDef, combatantDef } from "./catalog";
import { BUILD_CONFIG, type BuildSpec } from "./building";
import { hudStore, type ResearchView } from "./hudStore";
import { trainingConfigFor } from "./production";
import { SUGAR, GRANARY_TRICKLE, INCOME_TRICKLE, LEAF, NURSERY_HATCH_BONUS, PATIO_SIGHT_BONUS, TRAIL_HALF_LIFE, TRAIL_RAIN_DECAY } from "./tuning";
import {
  advanceHazards,
  BEAM_BUILDING_DPS,
  BEAM_UNIT_DPS,
  densestKnot,
  inSprinklerJet,
  laneEscape,
  MOWER_BUILDING_DAMAGE,
  MOWER_UNIT_DAMAGE,
  mowerEta,
  nightSightFactor,
  SPRINKLER_DPS,
  sprinklerWarming,
  underBeam,
  underMower,
  type HazardEvent,
} from "./hazards";
import { decayTrails, pruneAlarms, scentAt, washTrails } from "./pheromone";
import { dueTips, type CoachFacts } from "./coach";
import { onPatio } from "./yard";
import { YARD } from "./yardInstance";
import { broodLanes, matchRunning, reservedSupply, livingUnits, session, usedSupply, type UnitRuntime } from "./session";
import { grantResearch, RESEARCH_CONFIG, researchUnlocked, upgradeHave, upgradeRank, type UpgradeId } from "./upgrades";

/** Each upgrade's rank, ranks under way and whether its requirement holds, for the command card. */
function researchViews(): Record<UpgradeId, ResearchView> {
  const view = (id: UpgradeId): ResearchView => ({ rank: upgradeRank(id), have: upgradeHave(id), unlocked: researchUnlocked(id) });
  return { weapons: view("weapons"), armor: view("armor"), assault: view("assault"), bulwark: view("bulwark") };
}

function keepStat(ctx: GameContext, faction: "player" | "enemy"): { current: number; max: number } {
  const keep = livingUnits(faction, "building").find((u) => u.catalogId === `keep_${faction}`);
  if (keep === undefined) return { current: 0, max: 1 };
  const stat = ctx.scene.entity.stats.get(keep.id, "health");
  return stat === null ? { current: 0, max: 1 } : { current: Math.max(0, Math.round(stat.current)), max: stat.max };
}

/** Spawn a freshly-trained unit at the Nest's muster point and walk it onto the field. */
function spawnTrained(ctx: GameContext, unitId: string): void {
  const keepUnit = livingUnits("player", "building")[0];
  if (keepUnit === undefined) return;
  const keep = ctx.scene.entity.get(keepUnit.id);
  if (keep === null) return;
  const def = combatantDef(unitId);
  if (def === null) return;
  session.trainSeq += 1;
  const id = `${unitId}_t${session.trainSeq}`;
  const lane = ((session.trainSeq % 5) - 2) * 1.8;
  const ex = keep.position[0] + lane;
  const ez = keep.position[2] - 8;
  ctx.scene.entity.spawn(unitId, { id, position: [ex, 0, ez], role: "npc" });
  ctx.game.audio.play("muster", [ex, 0, ez]);
  const unit: UnitRuntime = {
    id,
    catalogId: unitId,
    faction: "player",
    kind: "unit",
    command: { kind: "move", x: session.rallyPoint?.x ?? ex, z: session.rallyPoint?.z ?? ez - 3 },
    guardPoint: { x: session.rallyPoint?.x ?? ex, z: session.rallyPoint?.z ?? ez - 3 },
    leash: 14,
    attackCooldown: 0,
  };
  session.units.set(id, unit);
}

/** The RTS heartbeat: unit orders + auto-combat resolve every frame. */
const aiSystem: SystemDefinition = defineSystem({
  id: "ember-command.ai",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    if (matchRunning()) { session.elapsed += dt; tickUnits(ctx, dt); }
  },
});

/** The Black Ant AI director: musters escalating reinforcement waves from the enemy black nest. */
const enemyAiSystem: SystemDefinition = defineSystem({
  id: "ember-command.enemyAi",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    // A campaign mission decides whether the drums roll; a free skirmish always does.
    if (matchRunning() && campaignWavesRunning(ctx)) tickEnemyWaves(ctx, dt);
  },
});

/** Keep the chosen formation: a member that drifted off its slot walks back while it is quiet. */
const formationSystem: SystemDefinition = defineSystem({
  id: "ember-command.formation",
  tick: { type: "frame", stage: "ai" },
  update(ctx) {
    if (matchRunning()) holdFormation(ctx);
  },
});

/** The colony's eyes this tick: every living friendly unit and building, hero furthest. */
function playerSightSources(ctx: GameContext): SightSource[] {
  const eyes: SightSource[] = [];
  for (const unit of session.units.values()) {
    if (unit.faction !== "player") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity === null) continue;
    // Night shortens every antenna; a patio stone is high ground that lengthens it again.
    const x = entity.position[0];
    const z = entity.position[2];
    const ground = unit.kind === "unit" && onPatio(YARD, x, z) ? PATIO_SIGHT_BONUS : 1;
    // A scout reads the colony's scent: on a trail its antennae ignore the dark.
    const scouting = unit.catalogId === "scout" && scentAt(session.trails, x, z) > 0.3;
    const night = scouting ? 1 : nightSightFactor(session.hazards);
    eyes.push({ x, z, radius: sightRadiusFor(unit.catalogId, unit.kind) * night * ground });
  }
  return eyes;
}

/** Black Ant units are drawn only inside Red sight; warcamps and keeps stay on the map as known
 * landmarks. The entity `hidden` flag is engine render-only (stealth cloaks), so positions, AI and
 * damage keep working for units the player cannot see. */
function applyEnemyFog(ctx: GameContext): void {
  for (const unit of session.units.values()) {
    if (unit.faction !== "enemy" || unit.kind !== "unit") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity === null) continue;
    const hidden = !enemyDrawn(session.fog, entity.position[0], entity.position[2]);
    if (entity.hidden !== hidden) ctx.scene.entity.update(unit.id, { hidden });
  }
}

/** Fog of war: refill the visible grid from friendly eyes (explored only grows) and hide Black Ants
 * outside it. Runs at 5 Hz — the minimap repaints on the same clock, so nothing lags a frame behind. */
const fogSystem: SystemDefinition = defineSystem({
  id: "ember-command.fog",
  tick: { type: "interval", every: 0.2 },
  update(ctx) {
    if (!matchRunning()) return;
    refreshSight(session.fog, playerSightSources(ctx));
    applyEnemyFog(ctx);
  },
});

/** Hero upkeep: mana regen + ability cooldown. */
const heroSystem: SystemDefinition = defineSystem({
  id: "ember-command.hero",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (matchRunning()) tickHero(ctx, dt);
  },
});

/** Advance the Nest training queue; each completed job spawns and musters a unit. */
const productionSystem: SystemDefinition = defineSystem({
  id: "ember-command.production",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    // A standing Nursery Chamber warms the brood: every egg hatches faster.
    const warmed = livingUnits("player", "building").some((u) => u.catalogId === "nursery") ? 1 + NURSERY_HATCH_BONUS : 1;
    const result = tickQueue(session.production, trainingConfigFor(broodLanes()), dt * warmed);
    session.production = result.state;
    for (const event of result.events) {
      if (event.type === "completed") spawnTrained(ctx, event.output.unitId);
      if (event.type === "completed") noteCampaignTrain(ctx, event.output.unitId);
    }
  },
});

/** Raise a finished building at its placed spot; a Fungus Garden lifts the supply cap. */
export function raiseBuilding(ctx: GameContext, spec: BuildSpec): void {
  const def = combatantDef(spec.type);
  if (def === null) return;
  session.trainSeq += 1;
  const id = `${spec.type}_b${session.trainSeq}`;
  ctx.scene.entity.spawn(spec.type, { id, position: [spec.x, 0, spec.z], role: "npc" });
  ctx.game.audio.play("raise", [spec.x, 0, spec.z]);
  session.units.set(id, {
    id,
    catalogId: spec.type,
    faction: "player",
    kind: "building",
    command: { kind: "idle" },
    guardPoint: { x: spec.x, z: spec.z },
    leash: 0,
    attackCooldown: 0,
  });
  const supply = buildingDef(spec.type)?.supply;
  if (supply !== undefined) session.supplyCap += supply;
}

/** Advance construction; each finished job raises its building. */
const constructionSystem: SystemDefinition = defineSystem({
  id: "ember-command.construction",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    const result = tickQueue(session.buildQueue, BUILD_CONFIG, dt);
    session.buildQueue = result.state;
    for (const event of result.events) {
      if (event.type === "completed") raiseBuilding(ctx, event.output);
      if (event.type === "completed") noteCampaignBuild(ctx, event.output.type);
    }
  },
});

/** Advance the research queue; each finished job raises its upgrade's rank permanently. */
const researchSystem: SystemDefinition = defineSystem({
  id: "ember-command.research",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    const result = tickQueue(session.research.queue, RESEARCH_CONFIG, dt);
    session.research.queue = result.state;
    for (const event of result.events) {
      if (event.type === "completed") grantResearch(event.output);
    }
  },
});

/** Acid Mounds auto-fire at the nearest hostile within range (shared pursuit + auto-target). */
const towerSystem: SystemDefinition = defineSystem({
  id: "ember-command.towers",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (matchRunning()) tickTowers(ctx, dt);
  },
});

/** What each yard beat says on the notice feed, and the cue it plays. */
const HAZARD_NOTICES: Record<string, { text: string; tone?: "info" | "deny" | "success" }> = {
  "sprinkler:on": { text: "The sprinkler hisses awake: stay out of the jet, it washes trails away." },
  "sprinkler:off": { text: "The sprinkler sputters off. The lawn steams." },
  mowerWarning: { text: "Engine roar! The lawnmower is coming down its lane: clear the cut.", tone: "deny" },
  mowerStart: { text: "The mower is crossing. Anything in the lane is mulch.", tone: "deny" },
  mowerDone: { text: "The mower has passed. The lane is clear, and very short." },
  "rain:on": { text: "Rain storm! Every ant wades slower and scent washes off fast." },
  "rain:off": { text: "The storm passes. Lay the trails again." },
  "night:on": { text: "Nightfall. The colony's antennae reach barely half as far." },
  "night:off": { text: "Dawn over the lawn." },
  "beamFocus:on": { text: "The lens focuses: get into the shade!", tone: "deny" },
  "beamFocus:off": { text: "The kid's hand wobbles. The beam blurs, for now." },
};

function hazardKey(event: HazardEvent): string {
  return "on" in event ? `${event.kind}:${event.on ? "on" : "off"}` : event.kind;
}

/** The cue each loud beat plays. */
function playHazardCue(ctx: GameContext, key: string): void {
  if (key === "sprinkler:on") ctx.game.audio.play("sprinkler");
  else if (key === "mowerWarning") ctx.game.audio.play("mower");
  else if (key === "rain:on") ctx.game.audio.play("rain");
  else if (key === "beamFocus:on") ctx.game.audio.play("sizzle");
}

/** Where the kid wants the beam: the biggest knot of red fighters out in the open. */
function beamPrey(ctx: GameContext): { x: number; z: number } | null {
  const points: { x: number; z: number }[] = [];
  for (const unit of session.units.values()) {
    // The kid follows the marching army, not the chambers or the foragers trudging home.
    if (unit.faction !== "player" || unit.kind !== "unit" || unit.catalogId === "worker") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity !== null) points.push({ x: entity.position[0], z: entity.position[2] });
  }
  const red = densestKnot(points, YARD);
  if (red !== null) return red;
  // With the whole colony in the shade the kid gets bored and burns whatever else moves: black ants.
  const black: { x: number; z: number }[] = [];
  for (const unit of session.units.values()) {
    if (unit.faction !== "enemy" || unit.kind !== "unit") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity !== null) black.push({ x: entity.position[0], z: entity.position[2] });
  }
  return densestKnot(black, YARD);
}

/** One hazard tick's harm to everything standing in the yard: the jet, the deck and the beam. */
function applyHazardHarm(ctx: GameContext, dt: number): void {
  const hz = session.hazards;
  for (const unit of [...session.units.values()]) {
    const entity = ctx.scene.entity.get(unit.id);
    if (entity === null) continue;
    const x = entity.position[0];
    const z = entity.position[2];
    let amount = 0;
    if (underMower(hz, YARD, x, z)) amount += unit.kind === "building" ? MOWER_BUILDING_DAMAGE * dt : MOWER_UNIT_DAMAGE;
    if (unit.kind === "unit" && unit.catalogId !== "wasp" && inSprinklerJet(hz, YARD, x, z)) amount += SPRINKLER_DPS * dt;
    if (underBeam(hz, YARD, x, z)) amount += (unit.kind === "building" ? BEAM_BUILDING_DPS : BEAM_UNIT_DPS) * dt;
    if (amount > 0) ctx.scene.entity.effect({ from: "yard", to: unit.id, effect: "damage", via: { amount } });
  }
}

/**
 * Nobody stands still under a mower: when it roars, black ants and idle red ants run out of its lane
 * on their own side. Red ants on a standing order keep it, so a march or a forage run through the cut
 * is still the commander's gamble (foragers wait at the edge, see `forageHoldsAtLane`).
 */
function dodgeMower(ctx: GameContext): void {
  for (const unit of session.units.values()) {
    if (unit.kind !== "unit" || unit.catalogId === "wasp") continue;
    // A red ant under a standing order (a march, an attack, a forage run) is the commander's call; one
    // just standing about feels the engine through the soil and gets out of the cut.
    if (unit.faction === "player" && unit.command.kind !== "idle" && unit.command.kind !== "hold") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity === null) continue;
    const out = laneEscape(YARD, entity.position[0], entity.position[2]);
    if (out !== null) unit.command = { kind: "move", x: out.x, z: out.z };
  }
}

/** The yard's clocks: advance them, announce their beats, and let them hurt whoever stands in the way. */
const hazardSystem: SystemDefinition = defineSystem({
  id: "ember-command.hazards",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    const prey = session.hazards.toggles.beam ? beamPrey(ctx) : null;
    for (const event of advanceHazards(session.hazards, YARD, dt, prey)) {
      const key = hazardKey(event);
      const notice = HAZARD_NOTICES[key];
      if (notice === undefined) continue;
      ctx.game.notices.push({ text: notice.text, tone: notice.tone ?? "info", ttlMs: 6000 });
      playHazardCue(ctx, key);
    }
    if (session.hazards.mower.phase !== "idle") dodgeMower(ctx);
    pruneAlarms(session.alarms, session.elapsed);
    for (const [id, until] of Object.entries(session.acid)) if (until <= session.elapsed) delete session.acid[id];
    applyHazardHarm(ctx, dt);
  },
});

/** Scent fades on its own, far faster in rain, and the sprinkler's jet washes out what it lands on. */
const trailSystem: SystemDefinition = defineSystem({
  id: "ember-command.trails",
  tick: { type: "interval", every: 0.25 },
  update(_ctx) {
    if (!matchRunning()) return;
    const hz = session.hazards;
    decayTrails(session.trails, 0.25, TRAIL_HALF_LIFE, hz.rain.on ? TRAIL_RAIN_DECAY : 1);
    if (hz.sprinkler.on) washTrails(session.trails, (x, z) => inSprinklerJet(hz, YARD, x, z));
  },
});

/** What the coach reads once a second. */
function coachFacts(): CoachFacts {
  const hud = hudStore.get();
  let foraging = 0;
  for (const unit of session.units.values()) {
    if (unit.command.kind === "gather") foraging += 1;
  }
  const enemySeen = enemyVisible();
  return {
    elapsed: session.elapsed,
    foraging,
    scented: session.trails.scent.some((v) => v > 0),
    trailPainted: session.trailPainted,
    hasBarracks: livingUnits("player", "building").some((u) => u.catalogId === "barracks"),
    broodFull: usedSupply() + reservedSupply() >= session.supplyCap,
    night: session.hazards.dark >= 0.5,
    enemySeen,
    skirmish: hud.campaign === null,
    beam: session.hazards.toggles.beam,
  };
}

let enemyVisibleCtx: GameContext | null = null;
/** Whether any black ant stands in the colony's sight right now. */
function enemyVisible(): boolean {
  const ctx = enemyVisibleCtx;
  if (ctx === null) return false;
  for (const unit of session.units.values()) {
    if (unit.faction !== "enemy" || unit.kind !== "unit") continue;
    const entity = ctx.scene.entity.get(unit.id);
    if (entity !== null && enemyDrawn(session.fog, entity.position[0], entity.position[2])) return true;
  }
  return false;
}

/** The field coach: one-time tips naming the next useful verb (see `coach.ts`). */
const coachSystem: SystemDefinition = defineSystem({
  id: "ember-command.coach",
  tick: { type: "interval", every: 1 },
  update(ctx) {
    if (!matchRunning()) return;
    enemyVisibleCtx = ctx;
    for (const tip of dueTips(coachFacts(), session.coachSeen)) {
      session.coachSeen.push(tip.id);
      ctx.game.notices.push({ text: tip.text, ttlMs: 11_000 });
    }
  },
});

/** A slow sugar trickle so a stalled economy can still recover a little. */
const incomeSystem: SystemDefinition = defineSystem({
  id: "ember-command.income",
  tick: { type: "interval", every: 1 },
  update(ctx) {
    if (!matchRunning()) return;
    const granaries = livingUnits("player", "building").filter((u) => u.catalogId === "granary").length;
    ctx.game.economy.grant(ctx.player.userId, SUGAR, INCOME_TRICKLE + granaries * GRANARY_TRICKLE);
  },
});

/** The player's fielded combat units (non-hero, non-building), with live health, for the army row. */
function armyRoster(ctx: GameContext): { id: string; kind: string; hp: number; max: number }[] {
  const out: { id: string; kind: string; hp: number; max: number }[] = [];
  for (const u of session.units.values()) {
    if (u.faction !== "player" || u.kind !== "unit" || u.catalogId === "hero") continue;
    const stat = ctx.scene.entity.stats.get(u.id, "health");
    if (stat === null) continue;
    out.push({ id: u.id, kind: u.catalogId, hp: Math.max(0, stat.current), max: stat.max });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** Snapshot live economy + counts for the HUD a few times a second. */
const hudSystem: SystemDefinition = defineSystem({
  id: "ember-command.hud",
  tick: { type: "interval", every: 0.2 },
  update(ctx) {
    const enemyKeep = keepStat(ctx, "enemy");
    const playerKeep = keepStat(ctx, "player");
    const active = activeJobs(session.production);
    hudStore.set({
      elapsed: Math.floor(session.elapsed),
      foodReserved: reservedSupply(),
      rallyArmed: session.rallyArmed,
      sugar: Math.floor(ctx.game.economy.balance(ctx.player.userId, SUGAR)),
      leaf: Math.floor(ctx.game.economy.balance(ctx.player.userId, LEAF)),
      foodUsed: usedSupply(),
      foodCap: session.supplyCap,
      playerUnits: livingUnits("player", "unit").length,
      enemyUnits: livingUnits("enemy", "unit").length,
      enemyKeepHp: enemyKeep.current,
      enemyKeepMax: enemyKeep.max,
      playerKeepHp: playerKeep.current,
      playerKeepMax: playerKeep.max,
      attackMoveArmed: session.attackMoveArmed,
      formation: session.formation.kind,
      wavesSent: session.enemyWave.sent,
      nextWaveIn: Math.max(0, Math.ceil(nextWaveEta())),
      rivalPhase: planPhase(),
      rivalTier: session.enemyWave.tier,
      producing: active.length + queuedJobs(session.production).length,
      trainProgress: active.length > 0 ? jobProgress(active[0]!) : 0,
      hasBarracks: livingUnits("player", "building").some((u) => u.catalogId === "barracks"),
      hasNursery: livingUnits("player", "building").some((u) => u.catalogId === "nursery"),
      trailArmed: session.trailArmed,
      hazards: {
        sprinkler: !session.hazards.toggles.sprinkler ? "none" : session.hazards.sprinkler.on ? "on" : sprinklerWarming(session.hazards, YARD) ? "warming" : "off",
        mower: session.hazards.toggles.mower ? session.hazards.mower.phase : "none",
        mowerIn: (() => { const eta = mowerEta(session.hazards, YARD); return eta === null ? null : Math.ceil(eta); })(),
        rain: session.hazards.rain.on,
        night: session.hazards.dark >= 0.5,
        dark: Math.round(session.hazards.dark * 20) / 20,
        beam: session.hazards.toggles.beam ? (session.hazards.beam.focused ? "focused" : "blurred") : "none",
      },
      buildArmed: session.buildArmed,
      building: activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length,
      research: researchViews(),
      researching: activeJobs(session.research.queue).length + queuedJobs(session.research.queue).length,
      heroLevel: heroLevel(ctx),
      heroActs: heroActViews(ctx),
      heroOffer: pendingHeroOffer(ctx),
      heroKit: carriedHeroPicks().map((pick) => ({ id: pick.id, label: pick.label, blurb: pick.blurb, icon: pick.icon, kind: pick.kind })),
      army: armyRoster(ctx),
    });
  },
});

/** The yard campaign's mission machine: objective timers, world reports and the next mission. Runs
 * in the last frame stage so a finished mission can restage the field after every gameplay system
 * has had its beat. */
const campaignSystem: SystemDefinition = defineSystem({
  id: "ember-command.campaign",
  tick: { type: "frame", stage: "effects" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    tickCampaign(ctx, dt, () => setupSkirmish(ctx));
  },
});

export const systems: readonly SystemDefinition[] = [
  aiSystem,
  formationSystem,
  enemyAiSystem,
  fogSystem,
  heroSystem,
  productionSystem,
  constructionSystem,
  researchSystem,
  towerSystem,
  hazardSystem,
  trailSystem,
  coachSystem,
  incomeSystem,
  hudSystem,
  campaignSystem,
];
