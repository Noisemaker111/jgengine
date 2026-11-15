import { seededRng } from "@jgengine/core/random/rng";

import type { GunDef } from "./guns";

/**
 * Every Junk Drawer weapon has a personality: a gameplay perk, a quirk that costs you something, and
 * a voice. This file is the model only (numbers, rules and lines); `combat/personalityRuntime.ts`
 * tracks how long a gun has been held, its kills and its moods, and raises the barks.
 *
 * The personality is derived from the gun's id on a stream of its own (`junk-personality:<id>`), so
 * rolling it never moves a draw on the drop, combat or perk streams.
 */
export type PersonalityId = "grumpy" | "cheerful" | "paranoid" | "dramatic" | "philosophical" | "clingy" | "competitive";

/** The moments a weapon speaks up. */
export type BarkEvent = "pickup" | "reload" | "kill" | "switchAway" | "lowAmmo" | "jam" | "merge" | "rival";

export interface PersonalityDef {
  id: PersonalityId;
  name: string;
  /** The upside, one line. */
  perk: string;
  /** The catch, one line. */
  quirk: string;
  /** Speech-bubble trim colour. */
  color: string;
  barks: Readonly<Record<BarkEvent, readonly string[]>>;
}

/** The numbers each personality runs on, in one place so a test can pin them. */
export const PERSONALITY_TUNING = {
  grumpy: { damage: 0.2, reloadSpeed: 0.75 },
  cheerful: { damage: -0.08, killHeal: 0.05 },
  paranoid: { assistDeg: 7, assistRange: 45, nervousChance: 0.15 },
  dramatic: { finaleFraction: 0.3, finaleDamage: 0.4, reloadSpeed: 0.8 },
  philosophical: { freeEvery: 6, interval: 1.12 },
  clingy: { stepMs: 4000, perStep: 0.03, cap: 0.3, guiltMs: 5000, guiltDamage: -0.1 },
  competitive: { perKill: 0.08, maxStacks: 5, sulkMs: 2500 },
} as const;

export const PERSONALITIES: readonly PersonalityDef[] = [
  {
    id: "grumpy",
    name: "Grumpy",
    perk: "+20% damage. It's angry, and it's taking it out on them.",
    quirk: "Reloads 25% slower, complaining the whole time.",
    color: "#ff6b4a",
    barks: {
      pickup: ["Oh great. Hands. Sweaty ones.", "Put me down. ...No? Fine.", "I was napping in that bush."],
      reload: ["Ugh. Fine. FINE.", "Every time. Every single time.", "You do this on purpose.", "Hold on, my back."],
      kill: ["Good. Stay down.", "Hmph. Adequate.", "That one owed me money.", "Don't expect a thank-you."],
      switchAway: ["Finally, some peace.", "Don't hurry back.", "Go on, use the shiny one."],
      lowAmmo: ["I'm running on fumes here.", "Feed me or I quit.", "Running low. Not that you'd care."],
      jam: ["Nope.", "Not today."],
      merge: ["You glued me to WHAT?", "I hate this. I hate all of this."],
      rival: ["Oh good. Another one.", "Don't expect me to share the holster."],
    },
  },
  {
    id: "cheerful",
    name: "Cheerful",
    perk: "Every kill heals you 5% — it's just so happy for you!",
    quirk: "-8% damage. It doesn't want to hurt anybody. Much.",
    color: "#ffd84a",
    barks: {
      pickup: ["Hiii! We're gonna be best friends!", "Oh wow, a new adventure!", "Yay! Somebody picked me!"],
      reload: ["Snack time!", "Refill! Woo!", "Brb, getting ready!"],
      kill: ["Great job, buddy!", "Oopsie! Sorry, Mr. Roomba!", "You're doing amazing!", "High five! Oh, no hands."],
      switchAway: ["Have fun! I'll be right here!", "Byeee! Miss you already!", "Tag, they're it!"],
      lowAmmo: ["Uh-oh, running a teensy bit low!", "Almost out! Still smiling!"],
      jam: ["Whoopsie!"],
      merge: ["New parts! I feel all tingly!", "I'm a whole new me!"],
      rival: ["Ooh, a new friend! Hi new friend!", "Welcome to the team!"],
    },
  },
  {
    id: "paranoid",
    name: "Paranoid",
    perk: "Auto-tracks the nearest threat: shots bend toward it.",
    quirk: "Twitchy trigger: 15% of shots spend an extra round.",
    color: "#7affb0",
    barks: {
      pickup: ["Who sent you? WHO SENT YOU?", "Quick, before the fridge sees us.", "Are you a firmware update?"],
      reload: ["Cover me, cover me, cover me!", "They're watching us reload. I can feel it.", "Quick! Quick quick quick!"],
      kill: ["One down. Ten thousand to go.", "Was that a decoy? It felt like a decoy.", "They'll send more. They always send more."],
      switchAway: ["You're leaving me out here? EXPOSED?", "It's a trap. That gun is a trap.", "I knew you'd betray me."],
      lowAmmo: ["We're low. They know we're low.", "Ammo's low. That's what they want."],
      jam: ["Something's in my barrel. Probably a tracker."],
      merge: ["New parts? Who manufactured these?!", "These parts could be bugged. Everything is bugged."],
      rival: ["Who's the new one? Check it for wires.", "I don't trust that one. Not one bit."],
    },
  },
  {
    id: "dramatic",
    name: "Dramatic",
    perk: "The finale: the last 30% of every magazine hits 40% harder.",
    quirk: "Needs a moment: reloads 20% slower.",
    color: "#ff5ad1",
    barks: {
      pickup: ["At LAST. A worthy stage.", "You may now hold... ME.", "The curtain rises!"],
      reload: ["Intermission!", "A brief pause... for effect.", "The second act will be GLORIOUS."],
      kill: ["Exeunt, pursued by ME!", "Such tragedy! Such SPECTACLE!", "They'll write songs about that one.", "Encore! ENCORE!"],
      switchAway: ["You'd leave me... mid-scene?!", "Fine. FINE. I'll be in my trailer.", "An understudy? How DARE you."],
      lowAmmo: ["The finale approaches!", "Now. NOW is when it gets good."],
      jam: ["I am... overcome."],
      merge: ["A costume change! At last!", "Reborn, like a phoenix! A crafty phoenix!"],
      rival: ["An understudy? In MY production?", "They'll never have my range."],
    },
  },
  {
    id: "philosophical",
    name: "Philosophical",
    perk: "Every 6th shot is free. What is a bullet, really?",
    quirk: "Fires 12% slower. It's thinking.",
    color: "#8fb4ff",
    barks: {
      pickup: ["Do we choose our wielders, or do they choose us?", "Ah. Another hand. Another meaning.", "I was a staple once. Now I am a question."],
      reload: ["Emptiness, then fullness. The eternal cycle.", "To reload is to begin again.", "Is a magazine ever truly full?"],
      kill: ["It was only ever a toaster, in the end.", "Return to the scrap from whence you came.", "If a Roomba falls in a forest...", "Another firmware, ended."],
      switchAway: ["All things are temporary. Even grips.", "I will contemplate this rejection.", "Go. Find your truth in another trigger."],
      lowAmmo: ["Scarcity teaches us to aim.", "Few rounds remain. Make them mean something."],
      jam: ["I paused to consider the void."],
      merge: ["Am I still me, with new parts? A ship of Theseus, with a trigger.", "The parts change. The question remains."],
      rival: ["Another voice in the drawer. Welcome, fellow traveller.", "We are all junk, in the end."],
    },
  },
  {
    id: "clingy",
    name: "Clingy",
    perk: "Gets stronger the longer you hold it: +3% damage every 4s, up to +30%.",
    quirk: "Switch away and it guilt-trips you: other guns deal 10% less for 5s.",
    color: "#ff9ec7",
    barks: {
      pickup: ["Promise you'll never let go?", "I've been waiting SO long for you.", "Hold me tighter. No, tighter."],
      reload: ["Don't look at other guns while I reload.", "I'll be quick! Don't leave!", "Still holding me? Good."],
      kill: ["We make such a good team!", "Did you see? I did that for YOU.", "Tell me I'm your favourite."],
      switchAway: ["Wait— where are you going?", "Is it the nail gun? It's the nail gun, isn't it.", "Fine. Go. I'll just be here. Alone.", "You'll come back. They always come back."],
      lowAmmo: ["I'm almost empty... like my heart.", "Don't swap me just because I'm low!"],
      jam: ["I'm too upset to fire."],
      merge: ["We're... together now? Forever?", "You changed me. I love it."],
      rival: ["Who is SHE?", "You said I was the only one.", "I saw how you looked at that one."],
    },
  },
  {
    id: "competitive",
    name: "Competitive",
    perk: "Every kill with it stacks +8% damage (up to 5) while you keep it out.",
    quirk: "Switch away and it sulks: jams for 2.5s when you come back, stacks gone.",
    color: "#ffb43a",
    barks: {
      pickup: ["Finally, a real contender.", "Watch and learn, rookie.", "I'm the best gun on this block and you know it."],
      reload: ["Pit stop! Clock's still running.", "Reloading. Still winning.", "Fastest reload on Maple Court."],
      kill: ["THAT'S a point for me!", "Scoreboard!", "Too easy.", "Who's keeping count? I am. It's me."],
      switchAway: ["Seriously? You're benching ME?", "Fine. See how you do without me.", "That gun has, like, half my kills."],
      lowAmmo: ["Gimme more! I'm on a streak!", "Don't make me lose on a technicality!"],
      jam: ["I'm not playing.", "*sulking noises*", "Oh, NOW you want me?"],
      merge: ["Upgrades? I was already winning.", "New parts. Same champion."],
      rival: ["New kid, huh? Try to keep up.", "I'll have twice its kills by lunch."],
    },
  },
];

const BY_ID = new Map(PERSONALITIES.map((entry) => [entry.id, entry]));

export function personalityById(id: string): PersonalityDef | undefined {
  return BY_ID.get(id as PersonalityId);
}

/** A gun's personality from its id alone: stable across saves, off every shared stream. */
export function derivePersonality(gun: Pick<GunDef, "id">): PersonalityId {
  const rng = seededRng(`junk-personality:${gun.id}`);
  return PERSONALITIES[Math.min(PERSONALITIES.length - 1, Math.floor(rng() * PERSONALITIES.length))]!.id;
}

/** The personality a gun carries, or (for one saved before personalities) the same derivation. */
export function personalityOf(gun: Pick<GunDef, "id" | "personality">): PersonalityDef {
  return personalityById(gun.personality ?? derivePersonality(gun)) ?? PERSONALITIES[0]!;
}

/** Everything the damage rule reads about a gun's moment, supplied by the runtime. */
export interface MoodState {
  /** How long it has been out, in ms. */
  heldMs: number;
  /** Competitive kill stacks. */
  killStacks: number;
  /** Rounds left over magazine size, 0..1. */
  magFraction: number;
  /** A Clingy gun elsewhere is guilt-tripping you. */
  guilty: boolean;
}

/** The damage multiplier a personality puts on its own gun's hits. */
export function moodDamageScale(id: PersonalityId, mood: MoodState): number {
  let pct = mood.guilty ? PERSONALITY_TUNING.clingy.guiltDamage : 0;
  switch (id) {
    case "grumpy":
      pct += PERSONALITY_TUNING.grumpy.damage;
      break;
    case "cheerful":
      pct += PERSONALITY_TUNING.cheerful.damage;
      break;
    case "dramatic":
      if (mood.magFraction <= PERSONALITY_TUNING.dramatic.finaleFraction) pct += PERSONALITY_TUNING.dramatic.finaleDamage;
      break;
    case "clingy": {
      const tuning = PERSONALITY_TUNING.clingy;
      pct += Math.min(tuning.cap, Math.floor(Math.max(0, mood.heldMs) / tuning.stepMs) * tuning.perStep);
      break;
    }
    case "competitive":
      pct += Math.min(PERSONALITY_TUNING.competitive.maxStacks, mood.killStacks) * PERSONALITY_TUNING.competitive.perKill;
      break;
    default:
      break;
  }
  return 1 + pct;
}

/** Reload-speed multiplier (below 1 is slower). */
export function moodReloadScale(id: PersonalityId): number {
  if (id === "grumpy") return PERSONALITY_TUNING.grumpy.reloadSpeed;
  if (id === "dramatic") return PERSONALITY_TUNING.dramatic.reloadSpeed;
  return 1;
}

/** Fire-interval multiplier (above 1 is slower). */
export function moodIntervalScale(id: PersonalityId): number {
  return id === "philosophical" ? PERSONALITY_TUNING.philosophical.interval : 1;
}

/** Whether a Philosophical gun's `shotIndex`th shot (1-based) is free. */
export function isFreeShot(id: PersonalityId, shotIndex: number): boolean {
  return id === "philosophical" && shotIndex > 0 && shotIndex % PERSONALITY_TUNING.philosophical.freeEvery === 0;
}

/** Career kill counts a weapon remarks on. */
export const KILL_MILESTONES: readonly number[] = [10, 25, 50, 100, 250, 500];

/** What each personality says when its career count reaches a milestone (`{n}` is the count). */
const MILESTONE_LINES: Readonly<Record<PersonalityId, string>> = {
  grumpy: "{n}. Don't make it a whole thing.",
  cheerful: "That's {n} together! I made us a scrapbook!",
  paranoid: "{n} confirmed. They're keeping a list too, you know.",
  dramatic: "{n} curtain calls! Fetch my roses!",
  philosophical: "{n}. Is the number large, or are we small?",
  clingy: "{n}! That's {n} reasons you can never leave me.",
  competitive: "{n}! New personal best. Again.",
};

/** The line for reaching `kills`, or null when it is not a milestone. */
export function milestoneLine(id: PersonalityId, kills: number): string | null {
  return KILL_MILESTONES.includes(kills) ? MILESTONE_LINES[id].replaceAll("{n}", String(kills)) : null;
}

/** A short live readout of the mood for the HUD ("+18% CLINGY"), or "" when it has nothing to say. */
export function moodLabel(id: PersonalityId, mood: MoodState, sulking: boolean): string {
  if (sulking) return "SULKING";
  const pct = Math.round((moodDamageScale(id, { ...mood, guilty: false }) - 1) * 100);
  if (id === "clingy" && pct > 0) return `ATTACHED +${pct}%`;
  if (id === "competitive" && mood.killStacks > 0) return `STREAK x${Math.min(PERSONALITY_TUNING.competitive.maxStacks, mood.killStacks)}`;
  if (id === "dramatic" && mood.magFraction <= PERSONALITY_TUNING.dramatic.finaleFraction) return "FINALE +40%";
  return "";
}
