import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { grant } from "@jgengine/core/economy/wallet";

import { clamp, type NeedId } from "../needs/needs";
import { householdStore } from "../session/store";
import { CREDITS, pushEvent, type HouseholdState } from "../session/types";

interface LifeEventDef {
  text: (name: string) => string;
  apply: (state: HouseholdState, memberId: string) => void;
  tone: "info" | "good";
}

const EVENT_DEFS: LifeEventDef[] = [
  {
    text: (n) => `${n} had a spark of inspiration — fun soared.`,
    apply: (s, id) => bump(s, id, "fun", 26),
    tone: "good",
  },
  {
    text: (n) => `${n} found a cache of ration crystals.`,
    apply: (s, id) => bump(s, id, "hunger", 24),
    tone: "good",
  },
  {
    text: (n) => `A drifting comet lit the sky — the whole household felt lighter.`,
    apply: (s) => {
      for (const mid of s.order) bump(s, mid, "fun", 12);
    },
    tone: "good",
  },
  {
    text: (n) => `${n} woke from a strange dream, oddly restless.`,
    apply: (s, id) => bump(s, id, "energy", -14),
    tone: "info",
  },
  {
    text: (n) => `${n} sent out a signal and got a friendly reply.`,
    apply: (s, id) => bump(s, id, "social", 20),
    tone: "good",
  },
  {
    text: () => `A traveling merchant beamed down a gift of credits.`,
    apply: (s) => {
      s.wallet = grant(s.wallet, CREDITS, 90);
    },
    tone: "good",
  },
];

function bump(state: HouseholdState, memberId: string, need: NeedId, delta: number): void {
  const member = state.members[memberId];
  if (member === undefined) return;
  member.needs[need] = clamp(member.needs[need] + delta);
}

export function registerLifeEvents(ctx: GameContext): void {
  ctx.time.every(38, () => rollEvent(ctx));
}

function rollEvent(ctx: GameContext): void {
  const state = householdStore.read(ctx);
  if (state.order.length === 0) return;
  const now = ctx.time.now();
  const seed = Math.floor(now * 1000) ^ state.eventSeq;
  const def = EVENT_DEFS[seed % EVENT_DEFS.length]!;
  const memberId = state.order[seed % state.order.length]!;
  const name = state.members[memberId]?.name ?? "Someone";
  def.apply(state, memberId);
  pushEvent(state, def.text(name), now, def.tone === "good" ? "good" : "info");
  householdStore.write(ctx, { ...state, members: { ...state.members } });
}
