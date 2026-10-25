import type { TriggeredRule } from "@jgengine/core/rules/triggeredRules";
import { seededRng } from "@jgengine/core/random/rng";
import { dropsFrom } from "./bossDrops";
import { LEGENDARY_NAMES, type GunDef, type GunFamily } from "./guns";

/**
 * Gun perks as content for the engine's triggered-rules seam. A perk is a name, a one-line read and a
 * list of rule templates; `perkRuntime.ts` stamps the templates per gun and applies the firings. The
 * perk choice for a gun is derived from its id on a stream of its own, so adding perks never moves a
 * draw on the drop or combat streams that the roll tests pin.
 *
 * Events the runtime raises (subject = gun id):
 * - `gun.shot`   facts `{ fullMag }`         — one per trigger pull
 * - `gun.prehit` facts `{ fluxed, downed }`  — before a pellet resolves; firings here shape that hit
 * - `gun.hit`    facts `{ crit }`            — after a pellet resolves
 * - `gun.kill`   facts `{ crit, elemental }` — a hit from this gun dropped a body
 * - `gun.reload` facts `{ armed }`           — a reload started (`armed` = Kill Clip primed)
 */
export type PerkEvent = "gun.shot" | "gun.prehit" | "gun.hit" | "gun.kill" | "gun.reload";

/** A rule without its per-gun id/owner: the runtime fills those in when the gun first fires. */
export type PerkRuleTemplate = Omit<TriggeredRule, "id" | "owner"> & { readonly event: PerkEvent };

export interface PerkDef {
  id: string;
  /** Name shown on the card and in the proc callout. */
  name: string;
  /** One-line read of what it does. */
  text: string;
  rules: readonly PerkRuleTemplate[];
  /** Families the perk can roll on (default: every family). Launchers never crit, so crit perks skip them. */
  families?: readonly GunFamily[];
  /** Only rolls on a gun whose element leaves a DoT. */
  needsDot?: boolean;
  /** Set on a named legendary's red-text perk. */
  signature?: { gun: string; flavor: string };
}

const CRIT_FAMILIES: readonly GunFamily[] = ["pistol", "smg", "shotgun", "rifle", "sniper"];
/** "Until the counter fills" — a counter perk's stacks live this long between procs. */
const COUNTER_MS = 600_000;

function counter(event: PerkEvent, every: number, then: "crit" | "refund", rounds = 1, when?: TriggeredRule["when"]): PerkRuleTemplate {
  return {
    event,
    ...(when === undefined ? {} : { when }),
    effect: { id: "perk.count", params: { every, then, rounds } },
    durationMs: COUNTER_MS,
    stacking: "stack",
    maxStacks: every,
  };
}

const crit = { eq: ["crit", true] } as const;

/** The rolled pool: rare guns take one, epics one or two, legendaries may add one beside the signature. */
export const ROLLED_PERKS: readonly PerkDef[] = [
  {
    id: "rampage",
    name: "Rampage",
    text: "Kills stack +12% damage for 4s, up to 3 times.",
    rules: [{ event: "gun.kill", effect: { id: "perk.damage", params: { pct: 0.12, label: "RAMPAGE" } }, durationMs: 4000, stacking: "stack", maxStacks: 3 }],
  },
  {
    id: "kill_clip",
    name: "Kill Clip",
    text: "Reload within 3s of a kill: +30% damage for 5s.",
    rules: [
      { event: "gun.kill", effect: { id: "perk.arm" }, durationMs: 3000, stacking: "refresh" },
      { event: "gun.reload", when: { eq: ["armed", true] }, effect: { id: "perk.damage", params: { pct: 0.3, label: "KILL CLIP" } }, durationMs: 5000, stacking: "refresh" },
    ],
  },
  {
    id: "subsistence",
    name: "Subsistence",
    text: "Kills put 25% of the magazine back.",
    rules: [{ event: "gun.kill", effect: { id: "perk.refund", params: { fraction: 0.25 } } }],
  },
  {
    id: "triple_tap",
    name: "Triple Tap",
    text: "Every third crit refunds a round.",
    families: CRIT_FAMILIES,
    rules: [counter("gun.hit", 3, "refund", 1, crit)],
  },
  {
    id: "outlaw",
    name: "Outlaw",
    text: "Crit kills reload 60% faster for 6s.",
    families: CRIT_FAMILIES,
    rules: [{ event: "gun.kill", when: crit, effect: { id: "perk.reload", params: { pct: 0.6, label: "OUTLAW" } }, durationMs: 6000, stacking: "refresh" }],
  },
  {
    id: "firefly",
    name: "Firefly",
    text: "Crit kills burst, hurting anything within 3.5m.",
    families: CRIT_FAMILIES,
    rules: [{ event: "gun.kill", when: crit, effect: { id: "perk.explode", params: { radius: 3.5, pct: 0.8, label: "FIREFLY" } } }],
  },
  {
    id: "leech",
    name: "Leech",
    text: "Kills heal 6% of max health.",
    rules: [{ event: "gun.kill", effect: { id: "perk.heal", params: { pct: 0.06 } } }],
  },
  {
    id: "shield_siphon",
    name: "Shield Siphon",
    text: "Kills restore 15% of your shield.",
    rules: [{ event: "gun.kill", effect: { id: "perk.shield", params: { pct: 0.15 } } }],
  },
  {
    id: "overcharge",
    name: "Overcharge",
    text: "Every 8th shot is a guaranteed crit.",
    families: CRIT_FAMILIES,
    rules: [counter("gun.shot", 8, "crit")],
  },
  {
    id: "contagion",
    name: "Contagion",
    text: "Kills spread this gun's element to 2 enemies within 6m.",
    needsDot: true,
    rules: [{ event: "gun.kill", when: { eq: ["elemental", true] }, effect: { id: "perk.spread", params: { count: 2, radius: 6, label: "CONTAGION" } } }],
  },
  {
    id: "opening_shot",
    name: "Opening Shot",
    text: "The first shot from a full magazine is a crit.",
    families: CRIT_FAMILIES,
    rules: [{ event: "gun.shot", when: { eq: ["fullMag", true] }, effect: { id: "perk.crit" } }],
  },
  {
    id: "last_word",
    name: "Last Word",
    text: "+50% damage during Emergency Reserve.",
    rules: [{ event: "gun.prehit", when: { eq: ["downed", true] }, effect: { id: "perk.hitScale", params: { pct: 0.5 } } }],
  },
];

/** One red-text perk per named legendary, keyed by its name. */
export const SIGNATURE_PERKS: readonly PerkDef[] = [
  // Pistols
  {
    id: "sig_ravager", name: "Short Fuse", signature: { gun: "Ravager", flavor: "Light the fuse. Walk away." },
    text: "Crit kills detonate: 5m blast at 120% damage.",
    rules: [{ event: "gun.kill", when: crit, effect: { id: "perk.explode", params: { radius: 5, pct: 1.2, label: "SHORT FUSE" } } }],
  },
  {
    id: "sig_endless", name: "Bottomless", signature: { gun: "Endless", flavor: "Reloading is for quitters." },
    text: "Kills refill the magazine.",
    rules: [{ event: "gun.kill", effect: { id: "perk.refund", params: { fraction: 1, label: "BOTTOMLESS" } } }],
  },
  {
    id: "sig_sixgun", name: "Six Shooter", signature: { gun: "Sixgun", flavor: "Six shots. Count 'em." },
    text: "Every 6th shot is a guaranteed crit.",
    rules: [counter("gun.shot", 6, "crit")],
  },
  // SMGs
  {
    id: "sig_cinder", name: "Wildfire", signature: { gun: "Cinder", flavor: "Feed the fire." },
    text: "Kills spread the element to 3 enemies within 8m.",
    rules: [{ event: "gun.kill", when: { eq: ["elemental", true] }, effect: { id: "perk.spread", params: { count: 3, radius: 8, label: "WILDFIRE" } } }],
  },
  {
    id: "sig_fluxer", name: "Feature, Not Bug", signature: { gun: "Fluxer", flavor: "It's not a bug. It's a feature." },
    text: "Fluxed targets always take crits.",
    rules: [{ event: "gun.prehit", when: { eq: ["fluxed", true] }, effect: { id: "perk.crit" } }],
  },
  {
    id: "sig_chatterbox", name: "Won't Shut Up", signature: { gun: "Chatterbox", flavor: "Nobody asked. It talks anyway." },
    text: "Kills stack +10% damage for 5s, up to 5 times.",
    rules: [{ event: "gun.kill", effect: { id: "perk.damage", params: { pct: 0.1, label: "CHATTER" } }, durationMs: 5000, stacking: "stack", maxStacks: 5 }],
  },
  // Shotguns
  {
    id: "sig_broadcast", name: "Now Hear This", signature: { gun: "Broadcast", flavor: "Now hear this." },
    text: "Kills restore 35% of your shield.",
    rules: [{ event: "gun.kill", effect: { id: "perk.shield", params: { pct: 0.35 } } }],
  },
  {
    id: "sig_flakcannon", name: "Close Enough", signature: { gun: "Flakcannon", flavor: "Close enough counts." },
    text: "Every kill bursts into flak: 4m at 60% damage.",
    rules: [{ event: "gun.kill", effect: { id: "perk.explode", params: { radius: 4, pct: 0.6, label: "FLAK" } } }],
  },
  {
    id: "sig_sledgehammer", name: "No Subtlety", signature: { gun: "Sledgehammer", flavor: "Subtlety is a rumor." },
    text: "Kills heal 12% of max health.",
    rules: [{ event: "gun.kill", effect: { id: "perk.heal", params: { pct: 0.12 } } }],
  },
  // Rifles
  {
    id: "sig_shredder", name: "Shred First", signature: { gun: "Shredder", flavor: "Shred first. Ask never." },
    text: "Every third crit refunds 3 rounds.",
    rules: [counter("gun.hit", 3, "refund", 3, crit)],
  },
  {
    id: "sig_piledriver", name: "On The Pile", signature: { gun: "Piledriver", flavor: "One more for the pile." },
    text: "Reload within 4s of a kill: +60% damage for 6s.",
    rules: [
      { event: "gun.kill", effect: { id: "perk.arm" }, durationMs: 4000, stacking: "refresh" },
      { event: "gun.reload", when: { eq: ["armed", true] }, effect: { id: "perk.damage", params: { pct: 0.6, label: "ON THE PILE" } }, durationMs: 6000, stacking: "refresh" },
    ],
  },
  {
    id: "sig_vandal", name: "Somebody Pays", signature: { gun: "Vandal", flavor: "Somebody's paying for this." },
    text: "Crit kills reload twice as fast and add +20% damage for 6s.",
    rules: [
      { event: "gun.kill", when: crit, effect: { id: "perk.reload", params: { pct: 1, label: "SOMEBODY PAYS" } }, durationMs: 6000, stacking: "refresh" },
      { event: "gun.kill", when: crit, effect: { id: "perk.damage", params: { pct: 0.2 } }, durationMs: 6000, stacking: "refresh" },
    ],
  },
  // Snipers
  {
    id: "sig_longshot", name: "Patience", signature: { gun: "Longshot", flavor: "Patience is a loaded word." },
    text: "The first shot from a full magazine crits for +50%.",
    rules: [
      { event: "gun.shot", when: { eq: ["fullMag", true] }, effect: { id: "perk.crit" } },
      { event: "gun.shot", when: { eq: ["fullMag", true] }, effect: { id: "perk.shotScale", params: { pct: 0.5 } } },
    ],
  },
  {
    id: "sig_ashfall", name: "Ashfall", signature: { gun: "Ashfall", flavor: "Let it all come down." },
    text: "Crit kills spread the element to 4 enemies within 10m.",
    rules: [{ event: "gun.kill", when: { all: [crit, { eq: ["elemental", true] }] }, effect: { id: "perk.spread", params: { count: 4, radius: 10, label: "ASHFALL" } } }],
  },
  {
    id: "sig_skullsplit", name: "Aim Higher", signature: { gun: "Skullsplit", flavor: "Aim higher." },
    text: "Crit kills stack +40% damage for 8s, up to 2 times.",
    rules: [{ event: "gun.kill", when: crit, effect: { id: "perk.damage", params: { pct: 0.4, label: "AIM HIGHER" } }, durationMs: 8000, stacking: "stack", maxStacks: 2 }],
  },
  // Launchers
  {
    id: "sig_kaboom", name: "Ka-BOOM", signature: { gun: "Kaboom", flavor: "Ka. BOOM." },
    text: "Kills put a rocket back in the tube.",
    rules: [{ event: "gun.kill", effect: { id: "perk.refund", params: { rounds: 1, label: "KA-BOOM" } }, cooldownMs: 250 }],
  },
  {
    id: "sig_starfall", name: "Make A Wish", signature: { gun: "Starfall", flavor: "Make a wish." },
    text: "Kills call down a second blast: 5m at 70% damage.",
    rules: [{ event: "gun.kill", effect: { id: "perk.explode", params: { radius: 5, pct: 0.7, label: "STARFALL" } }, rateLimit: { count: 3, windowMs: 1000 } }],
  },
  {
    id: "sig_aftershock", name: "Not Over Yet", signature: { gun: "Aftershock", flavor: "It's never over the first time." },
    text: "+100% damage during Emergency Reserve.",
    rules: [{ event: "gun.prehit", when: { eq: ["downed", true] }, effect: { id: "perk.hitScale", params: { pct: 1 } } }],
  },
];

const PERKS = new Map<string, PerkDef>([...ROLLED_PERKS, ...SIGNATURE_PERKS].map((perk) => [perk.id, perk]));
const SIGNATURE_BY_GUN = new Map(SIGNATURE_PERKS.map((perk) => [perk.signature!.gun, perk]));

export function perkById(id: string): PerkDef | undefined {
  return PERKS.get(id);
}

/** The named legendary a gun is, read off its maker and name ("Burning Sixgun" is a Blackwood Sixgun). */
export function legendaryNameOf(gun: Pick<GunDef, "rarity" | "family" | "manufacturer" | "name">): string | null {
  if (gun.rarity !== "legendary") return null;
  const names = LEGENDARY_NAMES[gun.family] ?? [];
  for (const [maker, name] of names) {
    if (maker === gun.manufacturer && (gun.name === name || gun.name.endsWith(` ${name}`))) return name;
  }
  return null;
}

export function signaturePerkFor(legendaryName: string): PerkDef | undefined {
  return SIGNATURE_BY_GUN.get(legendaryName);
}

function rollable(perk: PerkDef, gun: Pick<GunDef, "family" | "element">): boolean {
  if (perk.families !== undefined && !perk.families.includes(gun.family)) return false;
  if (perk.needsDot === true && (gun.element === "none" || gun.element === "explosive" || gun.element === "flux")) return false;
  return true;
}

/**
 * The perks a gun carries, derived only from its id, rarity, family, element and name. Rare rolls one,
 * epic one or two, legendary its signature (when it is a named one) plus a coin-flip rolled perk;
 * common and uncommon none. The stream is `scrap-perks:<id>`, so this is stable across saves and
 * never touches a shared rng.
 */
export function derivePerks(gun: Pick<GunDef, "id" | "rarity" | "family" | "element" | "manufacturer" | "name">): string[] {
  const rng = seededRng(`scrap-perks:${gun.id}`);
  const perks: string[] = [];
  let rolled = 0;
  if (gun.rarity === "rare") rolled = 1;
  else if (gun.rarity === "epic") rolled = rng() < 0.5 ? 2 : 1;
  else if (gun.rarity === "legendary") {
    const legendary = legendaryNameOf(gun);
    const signature = legendary === null ? undefined : signaturePerkFor(legendary);
    if (signature !== undefined) perks.push(signature.id);
    rolled = signature === undefined || rng() < 0.5 ? 1 : 0;
  }
  const pool = ROLLED_PERKS.filter((perk) => rollable(perk, gun));
  for (let index = 0; index < rolled && pool.length > 0; index += 1) {
    const pick = pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0]!;
    perks.push(pick.id);
  }
  return perks;
}

/** A gun's perks: the rolled list it carries, or (for a gun saved before perks) the same derivation. */
export function gunPerks(gun: GunDef): readonly PerkDef[] {
  const ids = gun.perks ?? derivePerks(gun);
  return ids.map((id) => PERKS.get(id)).filter((perk): perk is PerkDef => perk !== undefined);
}

/** What a card shows for one perk: red text with its flavor and farm source for a signature, a chip otherwise. */
export interface PerkLine {
  id: string;
  name: string;
  text: string;
  signature: boolean;
  flavor?: string;
  dropsFrom?: string;
}

export function perkLines(gun: GunDef): PerkLine[] {
  return gunPerks(gun).map((perk) => {
    const boss = perk.signature === undefined ? undefined : dropsFrom(perk.signature.gun);
    return {
      id: perk.id,
      name: perk.name,
      text: perk.text,
      signature: perk.signature !== undefined,
      ...(perk.signature !== undefined ? { flavor: perk.signature.flavor } : {}),
      ...(boss !== undefined ? { dropsFrom: boss } : {}),
    };
  });
}
