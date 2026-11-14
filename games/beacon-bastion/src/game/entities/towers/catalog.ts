import { findEditorCatalogEntry, type EditorDocument } from "@jgengine/core/editor/index";
import type { AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

import type { DamageType } from "../../combat/damage";

export interface SlowSpec {
  factor: number;
  durationMs: number;
}

/**
 * What a worker does beyond hitting things, read by `combat/towerAI.ts`. Every worker hits (or
 * pulses) something; these are the jobs that make one worth hiring over another.
 */
export type WorkerJob =
  | "barista" // scalding splash
  | "plumber" // soaks: leaves tech Wet
  | "electrician" // shock, huge on Wet, cuts a data center's power
  | "librarian" // SHHH: hushes notifications in reach
  | "teacher" // confiscates phones, snaps workers out of their screens
  | "grandma" // a small chance to just turn it off
  | "itguy" // reboots tech back to the start of the road
  | "firefighter" // hoses down anything overheating
  | "construction" // jackhammer: crushes armor, ground only
  | "farmer" // pitchfork, best against flyers
  | "lawyer" // cease and desist: freezes the biggest thing in reach
  | "janitor" // unplugs everything in reach, a little at a time
  | "mail" // brings cash every wave
  | "monk"; // offline aura: nobody near them can be distracted

/** What a worker says, and when. Lines are game data: the HUD and the field read them from here. */
export interface VoiceLines {
  /** Hired onto a plot. */
  place: readonly string[];
  /** Every so often on the job. */
  fire: readonly string[];
  /** A notification got through and they are looking at their phone. */
  distracted: readonly string[];
  /** Promoted up the ladder. */
  promote: readonly string[];
}

export interface TowerDef {
  id: string;
  label: string;
  /** The worker's trade in a few words, under the name on the hiring board. */
  role: string;
  description: string;
  cost: number;
  /** Seconds a hired worker spends clocking in before they start. Omitted = instant. */
  buildSeconds?: number;
  range: number;
  damage: number;
  fireRateHz: number;
  splashRadius: number;
  /** What the hit is made of, read against the tech's class and armor (`combat/damage.ts`). */
  damageType: DamageType;
  /** Whether it can reach tech in the air (drones, The Cloud). */
  hitsAir: boolean;
  slow?: SlowSpec;
  job: WorkerJob;
  targeting: AutoTargetPolicy;
  /** Colour of what they throw. */
  boltColor: string;
  icon: WorkerIcon;
  /** The worker's model, a `quaternius-animated-characters-pack` character in work clothes. */
  model: string;
  /** Uniform tint multiplied over the model, so two workers on one body still read apart. */
  tint?: string;
  /** The two shared promotions every worker climbs before choosing a path. */
  ranks: readonly [string, string];
  voice: VoiceLines;
  color: string;
}

export type WorkerIcon =
  | "coffee"
  | "wrench"
  | "bolt"
  | "book"
  | "apple"
  | "teacup"
  | "laptop"
  | "hose"
  | "hardhat"
  | "pitchfork"
  | "gavel"
  | "broom"
  | "envelope"
  | "lotus";

const PACK = "quaternius-animated-characters-pack";

export const TOWER_CATALOG: Record<string, TowerDef> = {
  worker_barista: {
    id: "worker_barista",
    label: "Barista",
    role: "Scalding splash",
    description: "Throws hot coffee that splashes and shorts out small gadgets. Can't reach the air.",
    cost: 50,
    range: 7.5,
    damage: 11,
    fireRateHz: 1.5,
    splashRadius: 1.6,
    damageType: "hot",
    hitsAir: false,
    job: "barista",
    targeting: "first",
    boltColor: "#7a4a24",
    icon: "coffee",
    model: `${PACK}/Chef_Female`,
    ranks: ["Shift Lead", "Head Barista"],
    voice: {
      place: ["Extra hot, for here.", "That's a tall order.", "Who's next?"],
      fire: ["Extra hot!", "Venti-sized problem.", "Order up!", "Careful, it's hot."],
      distracted: ["Ooh, a latte-art reel…", "Just one more scroll…"],
      promote: ["Head Barista? Pour me another.", "I'm brewing up something big."],
    },
    color: "#8a5a34",
  },
  worker_plumber: {
    id: "worker_plumber",
    label: "Plumber",
    role: "Soaks and slows",
    description: "Sprays water that slows tech and leaves it Wet: Electricians hit Wet tech for 2.5×.",
    cost: 65,
    range: 7,
    damage: 5,
    fireRateHz: 1.3,
    splashRadius: 0,
    damageType: "water",
    hitsAir: true,
    slow: { factor: 0.55, durationMs: 1600 },
    job: "plumber",
    targeting: "first",
    boltColor: "#5ab8ff",
    icon: "wrench",
    model: `${PACK}/Worker_Female`,
    tint: "#9ec4ff",
    ranks: ["Journeyman Plumber", "Master Plumber"],
    voice: {
      place: ["Gonna need a bigger wrench.", "Who's been flushing gadgets?"],
      fire: ["Hose 'em down!", "Water under the bridge.", "That's a leak, alright."],
      distracted: ["Wait, how do pipes work on TikTok?", "Huh, a clog compilation…"],
      promote: ["Master Plumber. Fear the plunger.", "Bigger wrench acquired."],
    },
    color: "#2f6fb0",
  },
  worker_farmer: {
    id: "worker_farmer",
    label: "Farmer",
    role: "Pitchfork, hits flyers",
    description: "Long-range pitchfork that pierces drones out of the sky: half again against anything flying.",
    cost: 60,
    range: 8,
    damage: 13,
    fireRateHz: 1.4,
    splashRadius: 0,
    damageType: "pierce",
    hitsAir: true,
    job: "farmer",
    targeting: "first",
    boltColor: "#d9b44a",
    icon: "pitchfork",
    model: `${PACK}/Cowboy_Male`,
    ranks: ["Farmhand", "Farm Boss"],
    voice: {
      place: ["Get off my land.", "Sun's up. Gadgets down."],
      fire: ["Get off my land!", "Shoo!", "Not on my crops!"],
      distracted: ["Is that… a drone selfie?", "Huh. Weather app says sunny."],
      promote: ["Farm Boss. Same boots.", "I'll need a bigger barn."],
    },
    color: "#7a5a2a",
  },
  worker_grandma: {
    id: "worker_grandma",
    label: "Grandma",
    role: "Turns it off",
    description: "Doesn't understand any of it. Every hit has a small chance to just turn the thing off (bosses only flinch).",
    cost: 70,
    range: 7,
    damage: 9,
    fireRateHz: 1.1,
    splashRadius: 0,
    damageType: "analog",
    hitsAir: true,
    job: "grandma",
    targeting: "first",
    boltColor: "#e8a0c8",
    icon: "teacup",
    model: `${PACK}/OldClassy_Female`,
    ranks: ["Great-Aunt", "Matriarch"],
    voice: {
      place: ["How do I make it stop?", "Back in my day…"],
      fire: ["Which button is OFF?", "Shoo, you!", "Is it plugged in, dear?", "Back in my day…"],
      distracted: ["Oh! A video of a cat!", "How do I close this?"],
      promote: ["Matriarch. Bring me my cardigan.", "I've outlived better gadgets than you."],
    },
    color: "#b46a9a",
  },
  worker_electrician: {
    id: "worker_electrician",
    label: "Electrician",
    role: "Shock, 2.5× vs Wet",
    description: "A live wire: huge damage on Wet tech, and the only trade that can cut a data center's power.",
    cost: 100,
    buildSeconds: 2,
    range: 7,
    damage: 24,
    fireRateHz: 0.8,
    splashRadius: 0,
    damageType: "shock",
    hitsAir: true,
    job: "electrician",
    targeting: "first",
    boltColor: "#ffe14a",
    icon: "bolt",
    model: `${PACK}/Casual2_Male`,
    tint: "#ffe08a",
    ranks: ["Licensed Electrician", "Master Electrician"],
    voice: {
      place: ["Who wired this?", "Let's see what we're dealing with."],
      fire: ["Lights out.", "Zap!", "That's not up to code.", "Who wired this?"],
      distracted: ["Smart outlet ad… tempting.", "Wait, a 'hack' for breakers?"],
      promote: ["Master Electrician. Watts up.", "Current events, handled."],
    },
    color: "#c9a21a",
  },
  worker_teacher: {
    id: "worker_teacher",
    label: "Teacher",
    role: "Confiscates phones",
    description: "Every few seconds confiscates a gadget in reach (for cash), and snaps nearby workers out of their phones.",
    cost: 90,
    range: 7,
    damage: 10,
    fireRateHz: 1,
    splashRadius: 0,
    damageType: "analog",
    hitsAir: true,
    job: "teacher",
    targeting: "first",
    boltColor: "#ff6a5a",
    icon: "apple",
    model: `${PACK}/Suit_Female`,
    ranks: ["Department Head", "Vice Principal"],
    voice: {
      place: ["Phones. Away. Now.", "Eyes up here, please."],
      fire: ["Phones. Away. Now.", "You'll get that back at the end of the day.", "Is that for the whole class?"],
      distracted: ["Just grading… on my phone…", "One email. One."],
      promote: ["Principal's office. Mine now.", "Tenure."],
    },
    color: "#c0392b",
  },
  worker_librarian: {
    id: "worker_librarian",
    label: "Librarian",
    role: "SHHH aura",
    description: "Notifications die in her reach: tech near her can't ping, and workers near her can't be pinged.",
    cost: 80,
    range: 7,
    damage: 3,
    fireRateHz: 1,
    splashRadius: 0,
    damageType: "analog",
    hitsAir: true,
    job: "librarian",
    targeting: "first",
    boltColor: "#b68cff",
    icon: "book",
    model: `${PACK}/Casual3_Female`,
    tint: "#d6b8ff",
    ranks: ["Reference Librarian", "Head Librarian"],
    voice: {
      place: ["Shhhhh.", "Inside voices."],
      fire: ["Shhhhh.", "Inside voices!", "This is a library."],
      distracted: ["E-books? Hmph… let me just look…"],
      promote: ["Head Librarian. Silence is golden.", "Shhh. Promotion."],
    },
    color: "#6a4aa8",
  },
  worker_construction: {
    id: "worker_construction",
    label: "Construction Worker",
    role: "Jackhammer, crushes armor",
    description: "A jackhammer blast that splashes and crushes armor for every other worker. Ground only.",
    cost: 95,
    buildSeconds: 3,
    range: 7,
    damage: 32,
    fireRateHz: 0.6,
    splashRadius: 2.2,
    damageType: "blunt",
    hitsAir: false,
    job: "construction",
    targeting: "first",
    boltColor: "#ffb020",
    icon: "hardhat",
    model: `${PACK}/Worker_Male`,
    ranks: ["Foreman", "Site Boss"],
    voice: {
      place: ["Coffee break's over.", "Hard hats on."],
      fire: ["Coffee break's over!", "Comin' through!", "Demolition time."],
      distracted: ["Hold on, watching a crane fail video…"],
      promote: ["Site Boss. Union approved.", "Bigger jackhammer, please."],
    },
    color: "#d08a1a",
  },
  worker_firefighter: {
    id: "worker_firefighter",
    label: "Firefighter",
    role: "Hoses overheating tech",
    description: "A heavy hose: more than double against overheating tech (graphics cards, mining rigs, the data center).",
    cost: 85,
    range: 7.5,
    damage: 14,
    fireRateHz: 1.1,
    splashRadius: 0,
    damageType: "water",
    hitsAir: false,
    job: "firefighter",
    targeting: "strongest",
    boltColor: "#9fe0ff",
    icon: "hose",
    model: `${PACK}/BlueSoldier_Male`,
    tint: "#ff9a7a",
    ranks: ["Engineer", "Captain"],
    voice: {
      place: ["It's running hot!", "Station's open."],
      fire: ["It's running hot!", "Cool it!", "Stand back!"],
      distracted: ["Ooh, a fire-truck livestream…"],
      promote: ["Captain. Ring the bell.", "Hotter fires, bigger hoses."],
    },
    color: "#c0392b",
  },
  worker_janitor: {
    id: "worker_janitor",
    label: "Janitor",
    role: "Unplugs everything nearby",
    description: "Unplugs everything in reach, a little at a time, and slows it down. Ground only.",
    cost: 75,
    range: 7,
    damage: 7,
    fireRateHz: 1,
    splashRadius: 0,
    damageType: "analog",
    hitsAir: false,
    slow: { factor: 0.85, durationMs: 1200 },
    job: "janitor",
    targeting: "first",
    boltColor: "#9ad07a",
    icon: "broom",
    model: `${PACK}/Casual_Male`,
    tint: "#a6c8a0",
    ranks: ["Custodian", "Head Custodian"],
    voice: {
      place: ["I just cleaned that.", "Who left all these cords out?"],
      fire: ["I just cleaned that.", "Unplugged!", "Not on my floor."],
      distracted: ["Huh, cleaning hacks… one more…"],
      promote: ["Head Custodian. Keys to everything.", "Cleanest street in town."],
    },
    color: "#5a8a4a",
  },
  worker_mail: {
    id: "worker_mail",
    label: "Mail Carrier",
    role: "Brings cash each wave",
    description: "Tosses junk mail at anything (air too), and brings 20 cash every time a wave arrives.",
    cost: 80,
    range: 7,
    damage: 7,
    fireRateHz: 1.2,
    splashRadius: 0,
    damageType: "pierce",
    hitsAir: true,
    job: "mail",
    targeting: "first",
    boltColor: "#f4f0e0",
    icon: "envelope",
    model: `${PACK}/Casual_Female`,
    tint: "#9fb4ff",
    ranks: ["Route Carrier", "Postmaster"],
    voice: {
      place: ["Neither rain nor sleet…", "Special delivery."],
      fire: ["Return to sender!", "Junk mail!", "Neither rain nor sleet…"],
      distracted: ["Tracking says 'out for delivery'… huh."],
      promote: ["Postmaster. Stamp of approval.", "First class, baby."],
    },
    color: "#2a4a9a",
  },
  worker_monk: {
    id: "worker_monk",
    label: "Monk",
    role: "Offline aura",
    description: "Workers near the monk can't be distracted at all. He doesn't fight; he is simply present.",
    cost: 90,
    range: 7,
    damage: 0,
    fireRateHz: 0,
    splashRadius: 0,
    damageType: "analog",
    hitsAir: false,
    job: "monk",
    targeting: "first",
    boltColor: "#ffc06a",
    icon: "lotus",
    model: `${PACK}/Kimono_Male`,
    tint: "#ffb060",
    ranks: ["Initiate", "Elder"],
    voice: {
      place: ["Be present.", "Breathe."],
      fire: ["Be present.", "Let it go.", "Breathe in. Unplug."],
      distracted: ["…"],
      promote: ["Elder. Still nothing to check.", "The signal is silence."],
    },
    color: "#d08020",
  },
  worker_itguy: {
    id: "worker_itguy",
    label: "IT Guy",
    role: "Reboots to the start",
    description: "Every so often reboots the furthest tech in reach, sending it back to the start of its road (bosses refuse).",
    cost: 120,
    buildSeconds: 2,
    range: 7,
    damage: 11,
    fireRateHz: 1,
    splashRadius: 0,
    damageType: "shock",
    hitsAir: true,
    job: "itguy",
    targeting: "first",
    boltColor: "#5aff9a",
    icon: "laptop",
    model: `${PACK}/Casual_Bald`,
    ranks: ["Help Desk", "Sysadmin"],
    voice: {
      place: ["Have you tried turning it off and on again?", "Ticket received."],
      fire: ["Have you tried turning it off and on again?", "Rebooting.", "It's always DNS."],
      distracted: ["Just checking the server logs… on Reddit."],
      promote: ["Sysadmin. Root access.", "I'll be in the server room."],
    },
    color: "#2a8a5a",
  },
  worker_lawyer: {
    id: "worker_lawyer",
    label: "Lawyer",
    role: "Cease & Desist",
    description: "Heavy legal damage that ignores armor, and a Cease & Desist that freezes the biggest tech in reach.",
    cost: 130,
    buildSeconds: 2,
    range: 7.5,
    damage: 28,
    fireRateHz: 0.6,
    splashRadius: 0,
    damageType: "legal",
    hitsAir: true,
    job: "lawyer",
    targeting: "strongest",
    boltColor: "#f6e6b0",
    icon: "gavel",
    model: `${PACK}/Suit_Male`,
    ranks: ["Associate", "Partner"],
    voice: {
      place: ["See you in court.", "I'll need a retainer."],
      fire: ["Objection!", "See you in court.", "Cease and desist!", "Sustained."],
      distracted: ["Billing this scroll to the client…"],
      promote: ["Partner. Name on the door.", "My hourly rate just went up."],
    },
    color: "#3a3a4a",
  },
};

export const TOWER_IDS: readonly string[] = Object.keys(TOWER_CATALOG);

function num(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Resolves a worker definition, overlaying in-editor catalog edits from the scene document when
 * present (`document.catalogs` / `findEditorCatalogEntry`).
 */
export function towerDef(id: string, document?: EditorDocument): TowerDef {
  const def = TOWER_CATALOG[id];
  if (def === undefined) throw new Error(`beacon-bastion: unknown worker id "${id}"`);
  if (document === undefined) return def;
  const entry = findEditorCatalogEntry(document, "towers", id);
  if (entry?.meta === undefined) return def;
  return {
    ...def,
    cost: num(entry.meta, "cost", def.cost),
    range: num(entry.meta, "range", def.range),
    damage: num(entry.meta, "damage", def.damage),
    fireRateHz: num(entry.meta, "fireRateHz", def.fireRateHz),
    splashRadius: num(entry.meta, "splashRadius", def.splashRadius),
  };
}

/** One line from a worker's voice, picked by a counter so the field stays deterministic. */
export function voiceLine(id: string, moment: keyof VoiceLines, seed: number): string {
  const lines = TOWER_CATALOG[id]?.voice[moment] ?? [];
  if (lines.length === 0) return "";
  return lines[Math.abs(Math.floor(seed)) % lines.length]!;
}
