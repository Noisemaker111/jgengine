import type { CreatureTerrain } from "@jgengine/core/ai/creatureDriver";
import type { TemperamentConfig } from "@jgengine/core/ai/temperament";

/**
 * Wildwire's machine instincts, per species, as data. A century of fabricators printing, repairing and
 * rewriting each other left every model with a temperament (how it treats you), targeting rules (who it
 * goes for first when several are near) and sometimes a signature trick. `creatures.ts` composes these
 * with the engine's temperament, target scoring and the creature driver; nothing here draws or ticks.
 */

/** How a wild bot treats the technician. */
export type Temperament =
  /** Grazes and only bolts when hit. */
  | "passive"
  /** Bolts from anything close and blares an alert that sends its herd running too. */
  | "skittish"
  /** Defends a patch of ground and charges what crosses it. */
  | "territorial"
  /** Hunts what it sees. */
  | "aggressive"
  /** Hunts like aggressive, and hits harder with packmates close. */
  | "pack"
  /** Holds still and hidden until prey is on top of it, then strikes. */
  | "ambush"
  /** Ignores you until you hurt it, then fights back. */
  | "retaliator";

/** Who a bot goes for first when more than one target is near. */
export type TargetRule =
  /** Sprinting, swinging, firing: the noisiest body. */
  | "loudest"
  /** A lit torch at night draws it. */
  | "brightest"
  /** The most valuable cargo carried. */
  | "richest"
  /** The most damaged. */
  | "weakest"
  /** Other machines (tames, other species) before people. */
  | "machines"
  /** Whoever hit it last. */
  | "attacker"
  /** The biggest machine around. */
  | "biggest";

/** What a candidate looks like to a bot choosing a target; every share is 0 to 1. */
export interface TargetFacts {
  loud: number;
  bright: number;
  rich: number;
  /** 1 - health share. */
  hurt: number;
  machine: boolean;
  attacker: boolean;
  /** Body size against the biggest bot on the island. */
  size: number;
}

/** Weight of a bot's first, second and third targeting rule. */
const RULE_WEIGHTS = [1, 0.6, 0.35] as const;

/**
 * How much a bot wants this target over plain nearness: its rules in order of preference, each scoring the
 * fact it cares about. Added to perception confidence, so a strong preference wins over a slightly nearer
 * or fresher target, and a bot with no rules picks the way the engine always does.
 */
export function targetScore(rules: readonly TargetRule[], facts: TargetFacts): number {
  let score = 0;
  rules.forEach((rule, index) => {
    const weight = RULE_WEIGHTS[index] ?? 0.2;
    const value =
      rule === "loudest" ? facts.loud
      : rule === "brightest" ? facts.bright
      : rule === "richest" ? facts.rich
      : rule === "weakest" ? facts.hurt
      : rule === "machines" ? (facts.machine ? 1 : 0)
      : rule === "attacker" ? (facts.attacker ? 1 : 0)
      : facts.size;
    score += weight * value;
  });
  return score;
}

/** A bot's signature trick when its strike lands on someone. */
export type StrikeTrick =
  /** Latches on and drains this much stamina. */
  | { kind: "drainStamina"; amount: number }
  /** Magnetic pull: this chance a hit yanks a metal tool out of the hand and drops it. */
  | { kind: "disarm"; chance: number }
  /** Steals one stack from the bag and blinks this many metres away to its nest. */
  | { kind: "steal"; blink: number }
  /** Lightning that jumps to everything else within `radius`, at `share` of the hit; doubled through water. */
  | { kind: "chain"; radius: number; share: number }
  /** Copies the last trick fired near it and uses it on its next strike. */
  | { kind: "mimic"; radius: number };

/** A bot's aura while it lives: what it does to other wild bots near it. */
export interface Aura {
  /** Melee multiplier given to every other wild bot within `radius`. */
  damage: number;
  radius: number;
}

export interface BotProfile {
  temperament: Temperament;
  targets: readonly TargetRule[];
  trick?: StrikeTrick;
  /** Pack: melee multiplier per packmate within `radius`, up to `max` packmates. */
  pack?: { radius: number; per: number; max: number };
  aura?: Aura;
  /** Disguised as a tree: stands dormant until someone chops within `radius`, then the forest stands up. */
  dormantUntilChop?: { radius: number };
  /** Hunts other machines and grows: melee gained per machine it scraps, up to `max` times its own. */
  scraps?: { perKill: number; max: number };
  /** Tamed and left on Guard Zone, it pings hostiles within `radius` metres. */
  sentry?: { radius: number };
  /** Uploaded, it flies what it carries home to the nearest storage box. */
  courier?: true;
  /** A singing ring: the highest-level singer conducts, and while it lives the rest take this share of damage. */
  conducted?: { radius: number; shielded: number };
  /** Ridden, it bends light around its rider: wild bots do not see you unless you hit them. */
  cloak?: true;
  /** Uploaded and following you, it rides on your shoulder instead of walking. */
  shoulder?: true;
  /** Wild, it is about only at night: by day it perches still. */
  nocturnal?: true;
  /** Wild and with nothing to fight, it sinks into the ground with only its shell showing; it bursts out to fight. */
  burrows?: true;
  /** Uploaded and following you, it patches you up: this much health every sentry sweep (4 s) within 6 m. */
  patches?: number;
  /** Uploaded on Guard Zone, it powers every fuelled station within `radius`: they never burn out. */
  powers?: { radius: number };
  /** Uploaded and near you, its crane lifts your build ghost higher and further out. */
  crane?: { radius: number; reach: number; lift: number };
  /** Uploaded, it smelts as it cuts: every `per` metal ore it bites comes out as one ingot. */
  smelts?: { per: number };
  /** Uploaded, its back is a deck: the technician and smaller bots can climb aboard and ride as it walks. */
  platform?: true;
  /** How deep it swims, metres under the surface to its base: a big body breaks the surface. Default 0.6. */
  swimDepth?: number;
  /** Where it may go: land (default), amphibious (swims rivers and shallows too) or water only. */
  terrain?: CreatureTerrain;
  /** What it is, in a line, for the dossier. */
  role: string;
}

const P = (temperament: Temperament, targets: readonly TargetRule[], role: string, extra: Partial<BotProfile> = {}): BotProfile => ({ temperament, targets, role, ...extra });

/** Every machine species: temperament, targeting, tricks. Bosses run on their own encounter. */
export const BOTS: Readonly<Record<string, BotProfile>> = {
  // The roster: the island's signature machines.
  mowbot: P("passive", [], "A lawnmower that wandered off. Trims grass into fiber; the first bot most technicians upload."),
  ticklet: P("pack", ["loudest", "weakest"], "Palm-sized spider drones in swarms. They latch on and drain your stamina; an uploaded one rides on your shoulder and patches you up.", { trick: { kind: "drainStamina", amount: 12 }, pack: { radius: 8, per: 0.15, max: 6 }, patches: 6, shoulder: true }),
  craneback: P("skittish", [], "A long-necked forklift. Spooks easily; rigged, it hauls more than anything its size. Uploaded and near you, its crane lifts your building pieces higher.", { crane: { radius: 10, reach: 2.5, lift: 3 } }),
  bulldozaur: P("territorial", ["attacker", "loudest"], "A territorial tank that charges intruders. Ridden, its blade bulk-harvests wood and stone."),
  lodestone: P("pack", ["loudest", "attacker"], "Magnetic wolves. Packmates charge each other's coils, and a bite can yank a metal tool from your hand.", { trick: { kind: "disarm", chance: 0.2 }, pack: { radius: 12, per: 0.2, max: 4 } }),
  mirrorcat: P("ambush", ["weakest"], "Light-bending hunter that waits unseen and strikes whatever is weakest. Rigged, it hides its rider: an invisible scout.", { cloak: true }),
  watchwing: P("skittish", [], "An owl-shaped sentry drone, out at night and perched still by day. Perched at your base on Guard Zone, it pings hostiles.", { sentry: { radius: 40 }, nocturnal: true }),
  arcwire: P("aggressive", ["loudest"], "River eel whose bite arcs through everything nearby, twice as hard through water. Uploaded on Guard Zone, it powers your stations.", { trick: { kind: "chain", radius: 6, share: 0.5 }, powers: { radius: 12 }, terrain: "amphibious", swimDepth: 0.35 }),
  klepto: P("aggressive", ["richest"], "Glitchy teleporter. Grabs one stack from your bag and blinks away to its nest.", { trick: { kind: "steal", blink: 30 } }),
  rootkit: P("ambush", ["loudest"], "Robots disguised as trees. Chop near one and the forest stands up.", { dormantUntilChop: { radius: 10 } }),
  thermite: P("territorial", ["attacker"], "Burrowing beetle that cuts metal ore: only its shell shows until you cross its ground. Uploaded, it mines faster than any pick and smelts the ore into ingots as it cuts.", { burrows: true, smelts: { per: 2 } }),
  homer: P("retaliator", ["richest"], "Carrier-pigeon cargo drone. Rigged, it flies and lifts; load it and it flies the cargo home to your nearest storage box.", { courier: true }),
  echo: P("ambush", ["attacker"], "A mimic. Copies the last trick used near it and turns it on you.", { trick: { kind: "mimic", radius: 20 } }),
  choir: P("pack", ["brightest"], "A hovering ring that sings frequencies: every wild bot near a choir hits harder. The conductor shields the rest: shoot it first.", { aura: { damage: 1.25, radius: 18 }, pack: { radius: 10, per: 0.1, max: 4 }, conducted: { radius: 12, shielded: 0.25 } }),
  lampjaw: P("ambush", ["brightest"], "Deep-water angler with a lure that glows like loot. It never leaves the water.", { terrain: "water", swimDepth: 1.5 }),
  hoover: P("retaliator", ["attacker"], "A huge passive vacuum leviathan. Leave it be and it leaves you be. Uploaded, its back is a walking base: climb aboard and ride.", { platform: true }),
  scrapper: P("aggressive", ["machines", "biggest"], "Apex hunter that tears other robots apart for parts and grows stronger with every one.", { scraps: { perKill: 0.1, max: 2 } }),
  // The wider machine ecosystem.
  ripsaw: P("aggressive", ["biggest", "loudest"], "Chainsaw-jawed biped that runs down anything that moves."),
  platebacker: P("territorial", ["attacker"], "Solar-plated grazer that guards its sunny patch."),
  sirenhorn: P("skittish", [], "A crested walker that blares a siren and bolts."),
  antennelk: P("skittish", [], "Antenna-antlered runner that hears you coming."),
  sparkspitter: P("aggressive", ["brightest"], "Small biped that spits sparks at lights."),
  ramjack: P("territorial", ["attacker", "loudest"], "Pile-driver head that rams intruders."),
  frostbyte: P("pack", ["weakest", "loudest"], "Snowfield wolf bots that run in packs.", { pack: { radius: 12, per: 0.2, max: 4 } }),
  hulkloader: P("territorial", ["attacker"], "A hulking loader that guards its quarry."),
  shrikebot: P("aggressive", ["loudest"], "Fast striding bird bot that kicks."),
  liftape: P("retaliator", ["attacker"], "A heavy-lifting ape frame; gentle until struck."),
  coilsheep: P("passive", [], "Fleece of copper coils. Uploads awake with gel from your hand."),
  rollgrinder: P("retaliator", ["attacker"], "A rolling stone crusher; uploaded, it grinds rock into stone by the pile."),
  clawmaul: P("aggressive", ["weakest"], "Clawed hunter that picks off the injured."),
  rhinodrill: P("territorial", ["attacker", "loudest"], "Drill-horned charger."),
  timberjack: P("territorial", ["attacker"], "Logging walker; uploaded, it fells trees for wood."),
  warhorn: P("aggressive", ["biggest"], "Giant broadcaster that hunts the biggest machine near."),
  fangsaw: P("aggressive", ["weakest"], "Saw-fanged stalker."),
  tuxbot: P("passive", [], "Waddling cold-weather service bot."),
  smogrhino: P("territorial", ["attacker"], "Exhaust-belching guardian of the cold plains."),
  ironbear: P("aggressive", ["attacker", "richest"], "Heavy bear frame that smells cargo."),
  coilcobra: P("aggressive", ["brightest"], "Cable snake that strikes at lights in caves."),
  puckbot: P("passive", [], "A floor-cleaning puck. Uploads awake."),
  bumperbot: P("retaliator", ["attacker"], "A dented bumper car on legs; uploads awake."),
  highrise: P("retaliator", ["attacker"], "A walking scaffold tower; ridden, it browses treetops."),
  pistonmare: P("skittish", [], "Piston-legged runner, the fastest mount on the plains."),
  zipstrider: P("skittish", [], "Light striding sprinter."),
  sawbeaver: P("retaliator", ["attacker"], "Buzzsaw-toothed builder bot; uploaded, it cuts wood."),
  hivedrone: P("pack", ["attacker", "brightest"], "The Hivemind's worker drones.", { pack: { radius: 8, per: 0.1, max: 6 } }),
  heatsink: P("territorial", ["attacker"], "Radiator-finned bot that keeps forged cores at temperature."),
  snapjaw: P("aggressive", ["loudest"], "Swamp crusher that waits in the shallows.", { terrain: "amphibious" }),
  springtoad: P("skittish", [], "Spring-loaded hopper of the swamp.", { terrain: "amphibious" }),
  siphon: P("ambush", ["weakest"], "Leech drone that siphons charge from the unwary.", { terrain: "amphibious" }),
  riptide: P("aggressive", ["loudest"], "River hunter that swims faster than you.", { terrain: "amphibious" }),
  railcrawler: P("aggressive", ["loudest"], "Segmented crawler of the caves."),
  stingvolt: P("aggressive", ["brightest"], "Scorpion bot with a shock tail."),
  wallcrawler: P("aggressive", ["weakest"], "Wall-climbing lizard bot of the caves."),
  pylon: P("passive", [], "A walking power pylon, enormous and harmless."),
  switchback: P("skittish", [], "Folds from biped to quad and back as it runs."),
  root_server: P("territorial", ["attacker", "loudest"], "The buried datacenter that broadcasts the Signal Storms. Destroy it and they stop."),
};

export function botProfile(species: string): BotProfile | null {
  return BOTS[species] ?? null;
}

/** The temperaments that come for you, for threat checks and the HUD. */
export const HOSTILE: ReadonlySet<Temperament> = new Set(["territorial", "aggressive", "pack", "ambush"]);

/** A temperament as a tuning of the engine's three kinds. Reach comes from the body. */
export function temperamentConfig(temperament: Temperament): TemperamentConfig {
  switch (temperament) {
    case "passive":
      return { kind: "passive", fleeRange: 0 };
    case "skittish":
      return { kind: "passive", fleeRange: 12 };
    case "territorial":
      return { kind: "territorial", territoryRadius: 10, breakAt: 0 };
    case "aggressive":
    case "pack":
      return { kind: "predator", breakAt: 0 };
    case "ambush":
      // Holds its post and strikes only what comes right up to it.
      return { kind: "territorial", territoryRadius: 4, breakAt: 0 };
    case "retaliator":
      return { kind: "territorial", territoryRadius: 0, breakAt: 0 };
  }
}

/** Eye glow by temperament: a technician reads a machine's intent from its eyes, day or night. */
export const TEMPERAMENT_GLOW: Readonly<Record<Temperament, string>> = {
  passive: "#5dff9a",
  skittish: "#ffe04a",
  territorial: "#ff9a2e",
  aggressive: "#ff3b3b",
  pack: "#ff4fd8",
  ambush: "#b06bff",
  retaliator: "#4ac8ff",
};

/** Pack melee multiplier with `packmates` of its own species within reach. */
export function packBonus(pack: BotProfile["pack"], packmates: number): number {
  if (pack === undefined) return 1;
  return 1 + pack.per * Math.min(pack.max, Math.max(0, packmates));
}

// --- traits: quirks from a sloppy upload, glitches from forging ----------------------------------

/** What a trait does to a bot. Multipliers default to 1. */
export interface TraitDef {
  id: string;
  label: string;
  /** Where it comes from, and for a glitch whether it helps. */
  kind: "quirk" | "good" | "bad" | "weird";
  note: string;
  health?: number;
  melee?: number;
  speed?: number;
  weight?: number;
  /** Multiplier on how fast its charge runs down. */
  drain?: number;
  /** Never reverts in a Signal Storm. */
  stormProof?: true;
  /** Twice as likely to revert in a Signal Storm. */
  stormProne?: true;
  /** Drawn bigger or smaller. */
  size?: number;
}

/**
 * Quirks: a sloppy upload leaves a permanent personality trait. Some help a little, most cost something,
 * all of them are visible on the bot's card.
 */
export const QUIRKS: readonly TraitDef[] = [
  { id: "stutter_drive", label: "Stutter Drive", kind: "quirk", note: "Its drive skips a beat: 10% slower.", speed: 0.9 },
  { id: "glass_jaw", label: "Glass Jaw", kind: "quirk", note: "Brittle plating: 15% less health.", health: 0.85 },
  { id: "power_hog", label: "Power Hog", kind: "quirk", note: "Burns charge 40% faster.", drain: 1.4 },
  { id: "loose_wiring", label: "Loose Wiring", kind: "quirk", note: "Signal Storms get into it twice as easily.", stormProne: true },
  { id: "hoarder", label: "Hoarder", kind: "quirk", note: "Packs its frame tight: carries 15% more, moves 5% slower.", weight: 1.15, speed: 0.95 },
  { id: "hothead", label: "Hothead", kind: "quirk", note: "Hits 10% harder and burns charge 20% faster.", melee: 1.1, drain: 1.2 },
  { id: "devoted", label: "Devoted", kind: "quirk", note: "Imprinted on you: Signal Storms never turn it.", stormProof: true },
];

/** Glitches: a forged bot may roll a random mutation, good, bad or just weird. */
export const GLITCHES: readonly TraitDef[] = [
  { id: "overclocked_core", label: "Overclocked Core", kind: "good", note: "Runs hot and fast: 12% quicker.", speed: 1.12 },
  { id: "reinforced_frame", label: "Reinforced Frame", kind: "good", note: "Plating printed twice: 20% more health.", health: 1.2 },
  { id: "efficient_cells", label: "Efficient Cells", kind: "good", note: "Charge lasts 30% longer.", drain: 0.7 },
  { id: "ghost_signal", label: "Ghost Signal", kind: "good", note: "Hears no broadcast: Signal Storms never turn it.", stormProof: true },
  { id: "short_circuit", label: "Short Circuit", kind: "bad", note: "Arcs inside its own frame: 10% less health and melee.", health: 0.9, melee: 0.9 },
  { id: "rust_bloom", label: "Rust Bloom", kind: "bad", note: "Corrodes fast: charge runs down 30% faster.", drain: 1.3 },
  { id: "giant_print", label: "Giant Print", kind: "weird", note: "Printed at the wrong scale: 25% bigger and carries more.", size: 1.25, weight: 1.15 },
  { id: "pocket_print", label: "Pocket Print", kind: "weird", note: "Printed small: 30% smaller and a little faster.", size: 0.7, speed: 1.05 },
];

const TRAITS = new Map([...QUIRKS, ...GLITCHES].map((trait) => [trait.id, trait]));

export function traitDef(id: string): TraitDef | null {
  return TRAITS.get(id) ?? null;
}

/** Below this upload integrity (taming effectiveness) an upload leaves a quirk. */
export const QUIRK_BELOW = 0.8;

/** The quirk a sloppy upload leaves, or null for a clean one. The sloppier, the likelier. */
export function rollQuirk(effectiveness: number, rng: () => number): string | null {
  if (effectiveness >= QUIRK_BELOW) return null;
  const chance = Math.min(1, (QUIRK_BELOW - effectiveness) / QUIRK_BELOW + 0.35);
  if (rng() >= chance) return null;
  return QUIRKS[Math.min(QUIRKS.length - 1, Math.floor(rng() * QUIRKS.length))]!.id;
}

/** The glitch a forged bot with `mutations` new mutations rolls, or null. */
export function rollGlitch(mutations: number, rng: () => number): string | null {
  if (mutations <= 0) return null;
  return GLITCHES[Math.min(GLITCHES.length - 1, Math.floor(rng() * GLITCHES.length))]!.id;
}

/** A trait list's combined multiplier on one stat. */
export function traitMultiplier(traits: readonly string[], stat: "health" | "melee" | "speed" | "weight" | "drain" | "size"): number {
  let value = 1;
  for (const id of traits) value *= TRAITS.get(id)?.[stat] ?? 1;
  return value;
}

// --- charge, rust and heat ------------------------------------------------------------------------

/** Air hotter than this overheats a bot standing in the sun. */
export const OVERHEAT_C = 30;

/**
 * How much faster a bot's charge runs down where it stands: rain and open water rust its joints, hard sun
 * overheats it, and a roof keeps both off. Approximate.
 */
export function chargeDrain(weather: { wet: boolean; covered: boolean; temperature: number }): { multiplier: number; cause: "rust" | "heat" | null } {
  if (weather.covered) return { multiplier: 1, cause: null };
  if (weather.wet) return { multiplier: 1.6, cause: "rust" };
  if (weather.temperature > OVERHEAT_C) return { multiplier: 1 + Math.min(1, (weather.temperature - OVERHEAT_C) / 10), cause: "heat" };
  return { multiplier: 1, cause: null };
}

// --- signal storms --------------------------------------------------------------------------------

/**
 * Signal Storms: some nights the Root Server under the island broadcasts. Wild bots go Overclocked (every
 * one hunts, faster and harder) and a tame left out under the open sky may revert to wild.
 */
export const SIGNAL_STORM = {
  /** One night in this many storms, picked by the night's number. */
  everyNights: 3,
  /** The night runs from this share of the day to dawn. */
  dusk: 0.8,
  dawn: 0.2,
  /** Overclocked wild bots: movement and melee multipliers. */
  speed: 1.3,
  melee: 1.3,
  /** Chance an exposed tame reverts when a storm starts. */
  revert: 0.15,
} as const;

/** Whether night number `night` (counted from the first) carries a storm. Deterministic so a save replays it. */
export function stormNight(night: number): boolean {
  return night > 0 && ((night * 2654435761) >>> 0) % SIGNAL_STORM.everyNights === 0;
}

/** Whether the clock (days since start, as a fractional count) is inside a storm. */
export function stormAt(days: number): boolean {
  const day = Math.floor(days);
  const fraction = days - day;
  if (fraction >= SIGNAL_STORM.dusk) return stormNight(day + 1);
  if (fraction < SIGNAL_STORM.dawn) return stormNight(day);
  return false;
}

/** Chance a tame with these traits reverts when a storm starts while it stands exposed. */
export function revertChance(traits: readonly string[]): number {
  let chance: number = SIGNAL_STORM.revert;
  for (const id of traits) {
    const trait = TRAITS.get(id);
    if (trait?.stormProof === true) return 0;
    if (trait?.stormProne === true) chance *= 2;
  }
  return Math.min(1, chance);
}

// --- behaviour chips --------------------------------------------------------------------------------

/**
 * Behaviour chips a tame runs, swapped from its card. Follow and Guard Zone are orders; Passive, Neutral
 * (Escort: fights what threatens you), Aggressive and Hunt Tech (goes for machines) are stances.
 */
export const CHIPS = [
  { id: "follow", label: "Follow", note: "Walks at your heel." },
  { id: "stay", label: "Guard Zone", note: "Holds this spot and defends it." },
  { id: "passive", label: "Passive", note: "Never fights, even when hit." },
  { id: "neutral", label: "Escort", note: "Fights what threatens you or itself." },
  { id: "aggressive", label: "Aggressive", note: "Goes for any wild machine it sees." },
] as const;
