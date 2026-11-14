import type { WorldChanges } from "@jgengine/core/worldModel/worldModel";
import type { UpgradePathsDecl, UpgradeStepDecl } from "@jgengine/core/worldModel/upgradePaths";

import { editorLayers } from "../../../editorLayers";
import { TOWER_IDS, towerDef, type TowerDef } from "./catalog";

/**
 * Every worker climbs two shared promotions, then commits to one of two careers that change how
 * they work, not only how hard: an espresso bar fires faster where a pour-over artisan scalds; a
 * burst main soaks the whole street where a pressure washer punches one gadget across it. The
 * engine compiles each ladder into world actions (`upgradePathActions`), so price, refusal, refund
 * and save all come from the town's world.
 */

/** A promotion costs this share of the hiring price, times the rank it leaves. */
const TRUNK_SHARE = 0.75;
/** What each shared promotion adds: damage and pace as a share of the base, reach and splash in metres. */
const PER_RANK = { damage: 0.5, rate: 0.15, range: 0.5, splash: 0.3 } as const;

function cash(amount: number): WorldChanges {
  return { "keep.gold": -amount };
}

/** A step that pays `price`, records it on the worker (the sale reads `spent`) and changes `effect`. */
function step(label: string, detail: string, price: number, effect: WorldChanges): UpgradeStepDecl {
  return { label, detail, cost: cash(price), effect: { ...effect, spent: price }, note: `{target}: promoted to ${label}.` };
}

function trunk(def: TowerDef): UpgradeStepDecl[] {
  return [1, 2].map((rank) => {
    const price = Math.round(def.cost * TRUNK_SHARE * rank);
    const label = def.ranks[rank - 1]!;
    return step(label, `+${Math.round(PER_RANK.damage * 100)}% damage, faster, longer reach`, price, {
      damage: def.damage * PER_RANK.damage,
      rate: def.fireRateHz * PER_RANK.rate,
      range: PER_RANK.range,
      ...(def.splashRadius > 0 ? { splash: PER_RANK.splash } : {}),
    });
  });
}

interface Career {
  id: string;
  label: string;
  detail: string;
  steps: readonly [UpgradeStepDecl, UpgradeStepDecl];
}

/** The two careers each worker can take after their second promotion. */
const CAREERS: Record<string, readonly [Career, Career]> = {
  worker_barista: [
    { id: "espresso", label: "Espresso Bar", detail: "Faster, then two cups at once", steps: [
      step("Double Shot", "Throws much faster, damage +4", 150, { rate: 0.8, damage: 4 }),
      step("Triple Ristretto", "Two targets a throw; coffee scalds (burns)", 240, { shots: 1, burn: 5 }),
    ] },
    { id: "pourover", label: "Pour-Over Artisan", detail: "Wider splash that keeps burning", steps: [
      step("Extra Hot", "Scalds (burns) and splashes wider", 150, { burn: 6, splash: 0.6 }),
      step("Molten Latte", "Damage +18, burns hotter, splashes wider", 250, { damage: 18, burn: 6, splash: 0.8 }),
    ] },
  ],
  worker_plumber: [
    { id: "burstmain", label: "Burst Main", detail: "Soaks everything in reach at once", steps: [
      step("Fire Hydrant", "Every spray soaks and slows all tech in reach", 150, { aura: 1, wet_ms: 1000 }),
      step("Main Break", "Deeper slow; soaked tech takes +20% from everyone", 240, { slow: -0.1, wet_ms: 2000, brittle: 0.2 }),
    ] },
    { id: "pressure", label: "Pressure Washer", detail: "A jet that actually hurts", steps: [
      step("Jet Nozzle", "Damage +14, reach +2", 160, { damage: 14, range: 2 }),
      step("Industrial Jet", "Damage +24, cuts 20 armor, staggers", 260, { damage: 24, pen: 20, stun_ms: 300 }),
    ] },
  ],
  worker_farmer: [
    { id: "scarecrow", label: "Scarecrow", detail: "Long reach and armor-piercing forks", steps: [
      step("Long Fork", "Reach +3, damage +12, cuts 20 armor", 170, { range: 3, damage: 12, pen: 20 }),
      step("Pest Control", "Every 4th fork lands triple; flyers take even more", 270, { crit_every: 4, crit_mult: 2, air_mult: 0.5 }),
    ] },
    { id: "harvest", label: "Harvest Season", detail: "Forks for the whole flock", steps: [
      step("Pitchfork Toss", "Three targets a throw, faster", 160, { shots: 2, rate: 0.5 }),
      step("Combine Harvester", "Four targets a throw, damage +10", 260, { shots: 1, damage: 10 }),
    ] },
  ],
  worker_grandma: [
    { id: "wrongbutton", label: "Wrong Button", detail: "Turns things off more often", steps: [
      step("Which One Is Off?", "Switch-off chance +5%", 160, { switchoff: 0.05 }),
      step("Back In My Day", "Switch-off chance +6%, reach +1", 260, { switchoff: 0.06, range: 1 }),
    ] },
    { id: "knitting", label: "Knitting Circle", detail: "Yarn that tangles wheels", steps: [
      step("Yarn Ball", "Hits slow tech, damage +6", 150, { slow: -0.4, slow_ms: 900, damage: 6 }),
      step("All Tangled Up", "Every 5th hit ties tech in place for 1.2 s; damage +8", 250, { freeze_every: 5, freeze_ms: 1200, damage: 8 }),
    ] },
  ],
  worker_electrician: [
    { id: "arc", label: "Arc Flash", detail: "Shocks that jump from gadget to gadget", steps: [
      step("Daisy Chain", "Each shock jumps to 3 more", 200, { chain: 3 }),
      step("Three-Phase", "Jumps to 5; damage +20", 320, { chain: 2, damage: 20 }),
    ] },
    { id: "breaker", label: "Breaker Box", detail: "Cuts power hard and fast", steps: [
      step("Kill Switch", "Drains a data center's power twice as fast; shocks stun", 190, { power_drain: 1, stun_ms: 400 }),
      step("Lights Out", "Damage +40; every 4th shock lands triple", 300, { damage: 40, crit_every: 4, crit_mult: 2 }),
    ] },
  ],
  worker_teacher: [
    { id: "detention", label: "Detention Hall", detail: "Confiscates faster and for more", steps: [
      step("Pop Quiz", "Confiscates every 5 s", 170, { confiscate_s: -3 }),
      step("Principal", "Confiscates every 3.5 s, and each pays 10 more", 280, { confiscate_s: -1.5, income: 10 }),
    ] },
    { id: "recess", label: "Recess Duty", detail: "Watches the whole yard", steps: [
      step("Hall Monitor", "Reach +2: snaps more workers out of their phones", 150, { range: 2 }),
      step("Field Trip", "Three targets a lecture, damage +14", 250, { shots: 2, damage: 14 }),
    ] },
  ],
  worker_librarian: [
    { id: "quiet", label: "Quiet Floor", detail: "A wider circle of silence", steps: [
      step("Silent Study", "Hush reach +2", 150, { range: 2 }),
      step("Absolute Silence", "Hush reach +1.5; hushed tech tiptoes (slows)", 240, { range: 1.5, aura: 1, slow: -0.25, slow_ms: 1000 }),
    ] },
    { id: "overdue", label: "Overdue Fines", detail: "Bookmarks that sting", steps: [
      step("Late Fees", "Two targets, damage +10", 150, { shots: 1, damage: 10 }),
      step("Banned For Life", "Damage +16; every SHHH stuns", 250, { damage: 16, stun_ms: 600 }),
    ] },
  ],
  worker_construction: [
    { id: "demolition", label: "Demolition Crew", detail: "Long, wide blasts that stagger", steps: [
      step("Wrecking Ball", "Reach +3, wider blast, damage +30, slower", 190, { range: 3, splash: 1, damage: 30, rate: -0.15 }),
      step("Controlled Blast", "Damage +60; every blast stuns what it hits", 300, { damage: 60, stun_ms: 500 }),
    ] },
    { id: "jackhammer", label: "Jackhammer Crew", detail: "Crushes armor so everyone bites", steps: [
      step("Rebar", "Each hit crushes 10 armor (3 stacks), faster", 170, { shred: 1, rate: 0.4 }),
      step("Steel Toe", "Crushes two stacks a hit, damage +25, faster", 270, { shred: 1, damage: 25, rate: 0.3 }),
    ] },
  ],
  worker_firefighter: [
    { id: "ladder", label: "Ladder Truck", detail: "Reaches the air, drenches a crowd", steps: [
      step("Aerial Ladder", "Can hose flyers; reach +1", 170, { air: 1, range: 1 }),
      step("Deluge Gun", "Splash 2 m, damage +16", 270, { splash: 2, damage: 16 }),
    ] },
    { id: "hazmat", label: "Hazmat Unit", detail: "Built for things that run hot", steps: [
      step("Foam", "Overheating tech takes even more; soaks it Wet", 160, { overheat_mult: 1, wet_ms: 3000 }),
      step("Fire Chief", "Damage +24, more against overheating", 260, { damage: 24, overheat_mult: 1 }),
    ] },
  ],
  worker_janitor: [
    { id: "wetfloor", label: "Wet Floor", detail: "Slippery and soaked", steps: [
      step("Caution Sign", "Leaves tech Wet; deeper slow", 150, { wet_ms: 2500, slow: -0.1 }),
      step("Industrial Mop", "Deeper slow, damage +6", 240, { slow: -0.15, damage: 6 }),
    ] },
    { id: "unplug", label: "Unplug Everything", detail: "A longer cord and a meaner yank", steps: [
      step("Extension Cord", "Reach +2, damage +5", 150, { range: 2, damage: 5 }),
      step("Breaker Room", "Damage +10; unplugged tech takes +20% from everyone", 250, { damage: 10, brittle: 0.2 }),
    ] },
  ],
  worker_mail: [
    { id: "express", label: "Express Mail", detail: "More cash, every wave", steps: [
      step("Priority", "Brings 15 more cash a wave", 150, { income: 15 }),
      step("Certified", "Brings 25 more cash a wave", 260, { income: 25 }),
    ] },
    { id: "junk", label: "Junk Mail", detail: "Bulk-rate flyers for everyone", steps: [
      step("Bulk Rate", "Three targets a toss, damage +6", 150, { shots: 2, damage: 6 }),
      step("Return To Sender", "Damage +12; slows what it hits", 240, { damage: 12, slow: -0.3, slow_ms: 1200 }),
    ] },
  ],
  worker_monk: [
    { id: "breath", label: "Deep Breath", detail: "A wider circle of peace", steps: [
      step("Mindful", "Offline reach +2", 150, { range: 2 }),
      step("Enlightened", "Offline reach +2; snaps distracted workers out", 240, { range: 2, snap: 1 }),
    ] },
    { id: "silence", label: "Vow of Silence", detail: "Stillness that slows tech down", steps: [
      step("Stillness", "Pulses calm: tech in reach slows", 150, { aura: 1, slow: -0.3, slow_ms: 1000, rate: 0.8 }),
      step("Inner Peace", "Each pulse deals 12 analog damage", 250, { damage: 12 }),
    ] },
  ],
  worker_itguy: [
    { id: "reboot", label: "Off And On Again", detail: "Reboots more often, wipes upgrades", steps: [
      step("Scheduled Restart", "Reboots every 10 s", 200, { reboot_s: -4 }),
      step("Factory Reset", "Reboots every 7 s and wipes installed updates", 300, { reboot_s: -3, wipe: 1 }),
    ] },
    { id: "firewall", label: "Firewall", detail: "Shocks that spread and soften", steps: [
      step("Packet Filter", "Damage +12; shocks jump to 2 more", 180, { damage: 12, chain: 2 }),
      step("Zero Trust", "Damage +20; shocked tech takes +25% from everyone", 290, { damage: 20, brittle: 0.25, slow_ms: 1600 }),
    ] },
  ],
  worker_lawyer: [
    { id: "injunction", label: "Injunction", detail: "Longer, more frequent freezes", steps: [
      step("Restraining Order", "Cease & Desist every 7 s, 0.8 s longer", 200, { cease_s: -3, cease_ms: 800 }),
      step("Supreme Court", "Every 5 s, 1 s longer again", 320, { cease_s: -2, cease_ms: 1000 }),
    ] },
    { id: "classaction", label: "Class Action", detail: "Subpoenas for everyone nearby", steps: [
      step("Discovery", "Each filing jumps to 3 more", 210, { chain: 3 }),
      step("Settlement", "Damage +40; jumps to 5", 320, { damage: 40, chain: 2 }),
    ] },
  ],
};

export const TOWER_LADDERS: Record<string, UpgradePathsDecl> = Object.fromEntries(
  TOWER_IDS.map((id) => {
    const def = towerDef(id, editorLayers);
    const careers = CAREERS[id];
    if (careers === undefined) throw new Error(`beacon-bastion: no careers for ${id}`);
    return [id, {
      kind: id,
      trunk: trunk(def),
      branches: careers.map((career) => ({ id: career.id, label: career.label, detail: career.detail, steps: [...career.steps] })),
    } satisfies UpgradePathsDecl];
  }),
);

/** The worker's live fact names beyond the ladder's own (`tier`, `branch`, `branch_tier`). */
export const TOWER_FACTS = [
  "spent",
  "damage",
  "range",
  "rate",
  "splash",
  "slow",
  "slow_ms",
  "shots",
  "chain",
  "burn",
  "shred",
  "pen",
  "crit_every",
  "crit_mult",
  "freeze_every",
  "freeze_ms",
  "stun_ms",
  "aura",
  "brittle",
  /** 1 when the worker can reach flyers. */
  "air",
  /** How long a hit leaves tech Wet, in ms. */
  "wet_ms",
  /** Seconds between a Teacher's confiscations. */
  "confiscate_s",
  /** Chance a Grandma's hit just turns the thing off. */
  "switchoff",
  /** Seconds between an IT Guy's reboots. */
  "reboot_s",
  /** 1 when a reboot also wipes installed updates. */
  "wipe",
  /** Extra multiplier a Firefighter's hose lands on overheating tech. */
  "overheat_mult",
  /** Extra multiplier against flyers. */
  "air_mult",
  /** Seconds between a Lawyer's Cease & Desist letters, and how long each freezes. */
  "cease_s",
  "cease_ms",
  /** Cash a Mail Carrier brings each wave, or extra a Teacher's confiscation pays. */
  "income",
  /** How much faster than normal an Electrician drains a data center's power. */
  "power_drain",
  /** 1 when the worker snaps distracted workers in reach back to work. */
  "snap",
] as const;
export type TowerFact = (typeof TOWER_FACTS)[number];

/** What each job starts with beyond the shared numbers. */
function jobFacts(def: TowerDef): Partial<Record<TowerFact, number>> {
  switch (def.job) {
    case "plumber":
      return { wet_ms: 4000 };
    case "teacher":
      return { confiscate_s: 8, snap: 1, income: 0 };
    case "grandma":
      return { switchoff: 0.07 };
    case "itguy":
      return { reboot_s: 14 };
    case "firefighter":
      return { overheat_mult: 1.2 };
    case "farmer":
      return { air_mult: 0.5 };
    case "lawyer":
      return { cease_s: 10, cease_ms: 2500 };
    case "janitor":
      return { aura: 1 };
    case "mail":
      return { income: 20 };
    case "electrician":
      return { power_drain: 1 };
    default:
      return {};
  }
}

/** What a fresh worker of `def` stands with, before any promotion. */
export function baseTowerFacts(def: TowerDef): Record<TowerFact, number> {
  return {
    spent: def.cost,
    damage: def.damage,
    range: def.range,
    rate: def.fireRateHz,
    splash: def.splashRadius,
    slow: def.slow?.factor ?? 1,
    slow_ms: def.slow?.durationMs ?? 0,
    shots: 1,
    chain: 0,
    burn: 0,
    shred: 0,
    pen: 0,
    crit_every: 0,
    crit_mult: 1,
    freeze_every: 0,
    freeze_ms: 0,
    stun_ms: 0,
    aura: 0,
    brittle: 0,
    air: def.hitsAir ? 1 : 0,
    wet_ms: 0,
    confiscate_s: 0,
    switchoff: 0,
    reboot_s: 0,
    wipe: 0,
    overheat_mult: 0,
    air_mult: 0,
    cease_s: 0,
    cease_ms: 0,
    income: 0,
    power_drain: 0,
    snap: 0,
    ...jobFacts(def),
  };
}
