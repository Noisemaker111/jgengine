import { giverOffer, type GiverOffer } from "@jgengine/core/mission/questGivers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { earn } from "../cash";
import { grantXp } from "../progression/curves";
import { award } from "../progression/unlocks";
import { speechStore } from "../stores";
import { moveNpcTo, spawnQuestEnemy } from "../world/setup";
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

/** Add progress to every active objective of `kind` aimed at `target`. */
export function creditObjective(ctx: GameContext, kind: Exclude<ScrapObjective["kind"], "kill">, target: string, amount = 1): void {
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
  ctx.scene.entity.floatText({ instanceId: userId, text: `MISSION COMPLETE · +${quest.reward.xp} XP`, kind: "pickup" });
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
  const line = busy !== undefined ? `${busy.title}: still out there waiting for you.` : "Nothing for you right now. Come back when you've grown a little.";
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

