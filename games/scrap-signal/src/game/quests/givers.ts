import { giverOffer, type GiverOffer } from "@jgengine/core/mission/questGivers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { seededRng } from "@jgengine/core/random/rng";

import { earn } from "../cash";
import { rollGun } from "../handroll";
import { grantXp } from "../progression/curves";
import { award } from "../progression/unlocks";
import { speechStore } from "../stores";
import { moveNpcTo, respawnForJob, spawnQuestEnemy } from "../world/setup";
import { NPCS, quests, scrapQuestById, type NpcId, type ScrapObjective, type ScrapQuest } from "./catalog";

/** The conversation on screen: who is talking, and the quest they are offering, if any. */
export interface NpcDialog {
  npc: NpcId;
  questId: string | null;
  line: string;
}

export const npcDialogStore = defineStore<NpcDialog | null>("scrap.npcDialog", null);

function say(ctx: GameContext, speaker: string, line: string): void {
  speechStore.write(ctx, { speaker, line, atMs: ctx.time.now() * 1000 });
}

function playerLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
}

/** What `npc` has for the player now, under the game's level rule. */
export function offerFrom(ctx: GameContext, npc: NpcId): GiverOffer {
  const journal = ctx.game.quest;
  if (journal === undefined) return { kind: "none" };
  const level = playerLevel(ctx);
  return giverOffer(journal, ctx.player.userId, npc, quests, {
    eligible: (def) => (scrapQuestById(def.id)?.minLevel ?? 1) <= level,
  });
}

/**
 * Add progress to every active objective of `kind` aimed at `target`. The engine credits kills of an
 * enemy's own catalog id itself; `kill` here is only for a local breed counting toward its base.
 */
export function creditObjective(ctx: GameContext, kind: ScrapObjective["kind"], target: string, amount = 1): void {
  const journal = ctx.game.quest;
  if (journal === undefined) return;
  const userId = ctx.player.userId;
  for (const entry of journal.list(userId)) {
    if (entry.status !== "active") continue;
    const quest = scrapQuestById(entry.questId);
    for (const objective of quest?.objectives ?? []) {
      if (objective.kind === kind && objective.target === target) journal.progress(userId, entry.questId, objective.id, amount);
    }
  }
}

function payQuest(ctx: GameContext, quest: ScrapQuest): void {
  const userId = ctx.player.userId;
  grantXp(ctx, userId, quest.reward.xp);
  if (quest.reward.cash !== undefined) earn(ctx, "cash", quest.reward.cash, "quest-reward", quest.id);
  if (quest.reward.cores !== undefined) earn(ctx, "cores", quest.reward.cores, "quest-reward", quest.id);
  for (const id of quest.reward.unlocks ?? []) award(ctx, id);
  if (quest.reward.gun !== undefined) giveUniqueGun(ctx, quest.reward.gun, quest);
  ctx.scene.entity.floatText({ instanceId: userId, text: `MISSION COMPLETE · +${quest.reward.xp} XP`, kind: "pickup" });
}

/** How far from the giver a reward is set down: past the talk prompt's reach, so E takes the gun, not the conversation. */
const REWARD_CLEARANCE = 4.6;

/**
 * A quest's unique gun, rolled at the player's level and set down between the player and the giver,
 * just outside the giver's talk range, to read and take.
 */
function giveUniqueGun(ctx: GameContext, name: string, quest: ScrapQuest): void {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return;
  const gun = rollGun(seededRng(`quest-reward:${quest.id}`), playerLevel(ctx), { unique: name });
  const giver = quest.turnIn === "radio" ? null : ctx.scene.entity.get(NPCS[quest.turnIn].entity);
  const from = giver?.position ?? me.position;
  const dx = me.position[0] - from[0];
  const dz = me.position[2] - from[2];
  const length = Math.hypot(dx, dz);
  const [ux, uz] = length > 0.01 ? [dx / length, dz / length] : [Math.sin(me.rotationY ?? 0), Math.cos(me.rotationY ?? 0)];
  const x = from[0] + ux * REWARD_CLEARANCE;
  const z = from[2] + uz * REWARD_CLEARANCE;
  ctx.scene.worldItem.spawn({
    itemId: gun.id,
    position: [x, ctx.world.groundHeightAt(x, z), z],
    rarity: gun.rarity,
    baseType: gun.family,
    source: "quest",
  });
  ctx.game.notices.push({ text: `Reward: ${gun.name}`, tone: "info" });
}

/** The level at which `npc` next has work, when the only thing holding it back is the player's level. */
function nextWorkLevel(ctx: GameContext, npc: NpcId): number | null {
  const journal = ctx.game.quest;
  if (journal === undefined) return null;
  const levels = quests
    .filter((def) => def.giver === npc && journal.canAccept(ctx.player.userId, def.id) === null)
    .map((def) => scrapQuestById(def.id)?.minLevel ?? 1);
  return levels.length === 0 ? null : Math.min(...levels);
}

function turnIn(ctx: GameContext, quest: ScrapQuest): boolean {
  const journal = ctx.game.quest;
  if (journal === undefined || journal.turnIn(ctx.player.userId, quest.id) !== null) return false;
  payQuest(ctx, quest);
  const speaker = quest.turnIn === "radio" ? NPCS[quest.giver].name : NPCS[quest.turnIn].name;
  say(ctx, speaker, quest.done);
  return true;
}

function accept(ctx: GameContext, quest: ScrapQuest): boolean {
  const journal = ctx.game.quest;
  if (journal === undefined || journal.accept(ctx.player.userId, quest.id) !== null) return false;
  for (const id of quest.opens ?? []) award(ctx, id);
  if (quest.spawn !== undefined) spawnQuestEnemy(ctx, quest.spawn);
  respawnForJob(ctx, quest.objectives.flatMap((objective) => (objective.kind === "kill" ? [objective.target] : [])));
  if (quest.meetAt !== undefined) moveNpcTo(ctx, NPCS[quest.giver].entity, quest.meetAt);
  say(ctx, NPCS[quest.giver].name, quest.brief);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `NEW MISSION · ${quest.title.toUpperCase()}`, kind: "pickup" });
  return true;
}

/**
 * Talk to someone: hand back a finished quest, take the one they are offering (a second talk while
 * the offer is on screen accepts it), or hear what they have to say.
 */
export function talkTo(ctx: GameContext, npc: NpcId): void {
  creditObjective(ctx, "talk", npc);
  const offer = offerFrom(ctx, npc);
  const open = npcDialogStore.read(ctx);
  if (offer.kind === "turnIn") {
    const quest = scrapQuestById(offer.questId);
    if (quest !== undefined && turnIn(ctx, quest)) {
      const next = offerFrom(ctx, npc);
      npcDialogStore.write(ctx, { npc, questId: next.kind === "give" ? next.questId : null, line: quest.done });
    }
    return;
  }
  if (offer.kind === "give") {
    const quest = scrapQuestById(offer.questId);
    if (quest === undefined) return;
    if (open !== null && open.npc === npc && open.questId === quest.id) {
      acceptOffer(ctx);
      return;
    }
    npcDialogStore.write(ctx, { npc, questId: quest.id, line: quest.brief });
    return;
  }
  const busy = offer.kind === "busy" ? scrapQuestById(offer.questId) : undefined;
  const waitFor = busy === undefined ? nextWorkLevel(ctx, npc) : null;
  const line =
    busy !== undefined
      ? `${busy.title}: still out there waiting for you.`
      : waitFor !== null
        ? `I'll have work for you at level ${waitFor}. Go make some noise until then.`
        : "Nothing for you right now. Ask me again after the next big job.";
  npcDialogStore.write(ctx, { npc, questId: null, line });
}

/** Take the quest the open conversation offers. */
export function acceptOffer(ctx: GameContext): void {
  const open = npcDialogStore.read(ctx);
  if (open === null || open.questId === null) return;
  const quest = scrapQuestById(open.questId);
  const offer = offerFrom(ctx, open.npc);
  if (quest === undefined || offer.kind !== "give" || offer.questId !== quest.id) return;
  if (accept(ctx, quest)) npcDialogStore.clear(ctx);
}

/** A radio quest turns itself in the moment its last objective is done. */
export function settleRadioQuests(ctx: GameContext): void {
  const journal = ctx.game.quest;
  if (journal === undefined) return;
  const userId = ctx.player.userId;
  for (const entry of journal.list(userId)) {
    if (entry.status !== "active") continue;
    const quest = scrapQuestById(entry.questId);
    if (quest?.turnIn !== "radio" || journal.canTurnIn(userId, quest.id) !== null) continue;
    turnIn(ctx, quest);
  }
}

/**
 * Re-grant what a loaded run has already earned: the roads its accepted quests opened and the
 * unlocks its finished ones paid, and re-place a quest enemy that is still to be killed.
 */
export function reconcileQuestWorld(ctx: GameContext): void {
  const journal = ctx.game.quest;
  if (journal === undefined) return;
  for (const entry of journal.list(ctx.player.userId)) {
    const quest = scrapQuestById(entry.questId);
    if (quest === undefined) continue;
    for (const id of quest.opens ?? []) award(ctx, id);
    if (quest.meetAt !== undefined) moveNpcTo(ctx, NPCS[quest.giver].entity, quest.meetAt);
    if (entry.status === "completed") for (const id of quest.reward.unlocks ?? []) award(ctx, id);
    else if (quest.spawn !== undefined && ctx.scene.entity.get(quest.spawn.instanceId) === null) spawnQuestEnemy(ctx, quest.spawn);
  }
}

