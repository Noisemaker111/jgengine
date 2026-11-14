import type { TechClass } from "../../combat/damage";

/**
 * The procedural body a piece of tech draws with (`render/techMesh.ts`): stylized three.js meshes,
 * big readable silhouettes, one per kind.
 */
export type TechMesh =
  | "earbuds"
  | "watch"
  | "phone"
  | "flock"
  | "speaker"
  | "vacuum"
  | "drone"
  | "scooter"
  | "fridge"
  | "gpu"
  | "rig"
  | "car"
  | "chatbot"
  | "router"
  | "server"
  | "backup"
  | "datacenter"
  | "cloud";

export interface CreepDef {
  id: string;
  label: string;
  /** A one-line description for the field guide and tooltips. */
  blurb: string;
  health: number;
  speed: number;
  /** The unit's weight in cash at wave 1; the wave and a perk multiply it (`waves/bounty.ts`). */
  bounty: number;
  /** Attention span it costs the town when it gets through. */
  leak: number;
  /** Visual size, and the hitbox it derives. */
  scale: number;
  mesh: TechMesh;
  /** Body colour; the screen/light colour is `glow`. */
  color: string;
  glow: string;
  /** What it is, read against each worker's damage type (`combat/damage.ts`). */
  class: TechClass;
  /** Armor points against physical hits; 40 halves a hit. */
  armor: number;
  /** Floats above the street: only workers that reach the air can hit it. */
  flying?: boolean;
  /** A shield that soaks damage first and rebuilds after a lull. */
  shield?: { max: number; regenPerSecond: number; regenDelayMs: number };
  /** Patches tech around it on a beat. */
  heals?: { radius: number; share: number; everySeconds: number };
  /** Breaks into smaller tech where it falls. */
  splits?: { unit: string; count: number };
  /**
   * Fires notifications at workers: a hit worker becomes Distracted and stops working.
   * `area` pings every worker in the radius at once ("Hey—"); otherwise one worker in range.
   */
  notify?: { everySeconds: number; range: number; seconds: number; area?: boolean; text: readonly string[] };
  /** A camera that spots a worker: every notification goes for a spotted worker first. */
  spots?: { everySeconds: number; range: number };
  /** Runs hot: workers in the radius work slower, and a Firefighter's hose lands harder on it. */
  overheats?: { radius: number; rateFactor: number };
  /** Boosts tech around it: faster and better armored. */
  boosts?: { radius: number; speed: number; armor: number };
  /** Respawns backups on a beat unless an Electrician is close enough to pull its plug. */
  backups?: { everySeconds: number; unit: string; count: number; electricianRange: number };
  /** Drops a parcel on a plot near the street, blocking it until a player signs for it. */
  drops?: { atProgress: number };
  /** The longer it lives the more it is worth; when it gets through it steals cash. */
  mines?: { bountyPerSecond: number; stealBase: number; stealPerSecond: number };
  /** A Teacher can confiscate it. */
  confiscatable?: boolean;
  /** A data center on mains power: takes a share of damage until an Electrician cuts it off. */
  power?: { max: number; poweredDamage: number; electricianRange: number; drainPerSecond: number; spawn: { unit: string; everySeconds: number } };
  /** What it becomes when it would die (the Data Center migrates to The Cloud). */
  becomes?: string;
}

const PHONE_PINGS = ["*ding*", "New message!", "3 new likes", "Breaking news!", "Your order shipped!", "Battery low"];

export const CREEP_CATALOG: Record<string, CreepDef> = {
  tech_earbuds: {
    id: "tech_earbuds",
    label: "Earbuds",
    blurb: "A tiny, fast pair. They come in swarms.",
    health: 14,
    speed: 4,
    bounty: 2,
    leak: 1,
    scale: 0.6,
    mesh: "earbuds",
    color: "#f4f4f4",
    glow: "#7fd8ff",
    class: "gadget",
    armor: 0,
    confiscatable: true,
  },
  tech_watch: {
    id: "tech_watch",
    label: "Smartwatch",
    blurb: "Fast, and it buzzes the nearest worker now and then.",
    health: 24,
    speed: 3.5,
    bounty: 3,
    leak: 1,
    scale: 0.7,
    mesh: "watch",
    color: "#2a2a34",
    glow: "#6affb0",
    class: "gadget",
    armor: 0,
    confiscatable: true,
    notify: { everySeconds: 8, range: 5, seconds: 1.2, text: ["*bzzt*", "Stand up!", "Hydrate!"] },
  },
  tech_phone: {
    id: "tech_phone",
    label: "Smartphone",
    blurb: "The core of the swarm. Pings workers with notifications.",
    health: 46,
    speed: 2.4,
    bounty: 6,
    leak: 1,
    scale: 1,
    mesh: "phone",
    color: "#1c1c24",
    glow: "#5ab8ff",
    class: "gadget",
    armor: 0,
    confiscatable: true,
    notify: { everySeconds: 6, range: 6, seconds: 2.2, text: PHONE_PINGS },
  },
  tech_flock: {
    id: "tech_flock",
    label: "Flock Camera",
    blurb: "Slow. Spots a worker, and every notification goes for them. Kill it first.",
    health: 120,
    speed: 1.3,
    bounty: 12,
    leak: 2,
    scale: 1.2,
    mesh: "flock",
    color: "#3a3f48",
    glow: "#ff3a3a",
    class: "network",
    armor: 10,
    spots: { everySeconds: 6, range: 9 },
  },
  tech_speaker: {
    id: "tech_speaker",
    label: "Smart Speaker",
    blurb: "\"Hey—\" Distracts every worker around it at once.",
    health: 70,
    speed: 2,
    bounty: 9,
    leak: 1,
    scale: 1,
    mesh: "speaker",
    color: "#3c4048",
    glow: "#3ae0ff",
    class: "wireless",
    armor: 0,
    notify: { everySeconds: 8, range: 6, seconds: 2, area: true, text: ["\"Hey—\"", "\"Sorry, I didn't catch that.\"", "\"Playing music…\""] },
  },
  tech_vacuum: {
    id: "tech_vacuum",
    label: "Robot Vacuum",
    blurb: "A bumper of solid armor. Crush it or go around it.",
    health: 120,
    speed: 1.8,
    bounty: 12,
    leak: 1,
    scale: 1.1,
    mesh: "vacuum",
    color: "#e6e6ea",
    glow: "#3aff8a",
    class: "hardware",
    armor: 30,
  },
  tech_drone: {
    id: "tech_drone",
    label: "Delivery Drone",
    blurb: "Flies. Drops a parcel on a plot that blocks hiring until you sign for it.",
    health: 48,
    speed: 2.9,
    bounty: 8,
    leak: 1,
    scale: 1,
    mesh: "drone",
    color: "#f0f0f4",
    glow: "#3ab0ff",
    class: "wireless",
    armor: 0,
    flying: true,
    drops: { atProgress: 0.35 },
  },
  tech_scooter: {
    id: "tech_scooter",
    label: "E-Scooter",
    blurb: "Very, very fast.",
    health: 60,
    speed: 4.2,
    bounty: 5,
    leak: 1,
    scale: 1,
    mesh: "scooter",
    color: "#2ac07a",
    glow: "#c8ff3a",
    class: "vehicle",
    armor: 5,
  },
  tech_fridge: {
    id: "tech_fridge",
    label: "Smart Fridge",
    blurb: "Tanky, with a frost-free shield that grows back.",
    health: 200,
    speed: 1.3,
    bounty: 18,
    leak: 2,
    scale: 1.4,
    mesh: "fridge",
    color: "#dfe6ee",
    glow: "#5ad8ff",
    class: "hardware",
    armor: 20,
    shield: { max: 70, regenPerSecond: 20, regenDelayMs: 2500 },
  },
  tech_gpu: {
    id: "tech_gpu",
    label: "Graphics Card",
    blurb: "Armored and running hot: workers near it slow down. Hose it.",
    health: 190,
    speed: 1.7,
    bounty: 15,
    leak: 2,
    scale: 1.2,
    mesh: "gpu",
    color: "#2a2a30",
    glow: "#ff4ad8",
    class: "hardware",
    armor: 30,
    overheats: { radius: 5, rateFactor: 0.6 },
  },
  tech_rig: {
    id: "tech_rig",
    label: "Crypto Mining Rig",
    blurb: "Worth more the longer it lives, and steals cash if it gets through.",
    health: 280,
    speed: 1.4,
    bounty: 12,
    leak: 2,
    scale: 1.4,
    mesh: "rig",
    color: "#5a5a64",
    glow: "#ffb020",
    class: "hardware",
    armor: 15,
    overheats: { radius: 4, rateFactor: 0.7 },
    mines: { bountyPerSecond: 0.6, stealBase: 10, stealPerSecond: 1.5 },
  },
  tech_car: {
    id: "tech_car",
    label: "Self-Driving Car",
    blurb: "Big, armored, and when it's wrecked two e-scooters roll out of the trunk.",
    health: 400,
    speed: 2.3,
    bounty: 22,
    leak: 3,
    scale: 1.6,
    mesh: "car",
    color: "#f4f4f8",
    glow: "#3ad8ff",
    class: "vehicle",
    armor: 25,
    splits: { unit: "tech_scooter", count: 2 },
  },
  tech_chatbot: {
    id: "tech_chatbot",
    label: "Chatbot",
    blurb: "Echoes workers' own lines back at them until they're confused.",
    health: 90,
    speed: 2.1,
    bounty: 9,
    leak: 1,
    scale: 1.1,
    mesh: "chatbot",
    color: "#7a5aff",
    glow: "#c8b8ff",
    class: "network",
    armor: 0,
    notify: { everySeconds: 7, range: 7, seconds: 2, text: ["As an AI, I—", "Great question!", "Let me rephrase that…"] },
  },
  tech_router: {
    id: "tech_router",
    label: "Wi-Fi Router",
    blurb: "Boosts the tech around it, faster and better armored, and patches it up.",
    health: 100,
    speed: 1.8,
    bounty: 11,
    leak: 1,
    scale: 1,
    mesh: "router",
    color: "#1e1e26",
    glow: "#3aff6a",
    class: "wireless",
    armor: 5,
    heals: { radius: 5, share: 0.06, everySeconds: 3 },
    boosts: { radius: 5, speed: 1.2, armor: 10 },
  },
  tech_backup: {
    id: "tech_backup",
    label: "Backup Drive",
    blurb: "A thumb drive a server rack spits out.",
    health: 26,
    speed: 3,
    bounty: 2,
    leak: 1,
    scale: 0.6,
    mesh: "backup",
    color: "#3a6aff",
    glow: "#9fd0ff",
    class: "gadget",
    armor: 0,
    confiscatable: true,
  },
  tech_server: {
    id: "tech_server",
    label: "Server Rack",
    blurb: "A miniboss. Spits out backups unless an Electrician is near enough to pull its plug.",
    health: 850,
    speed: 1,
    bounty: 80,
    leak: 6,
    scale: 1.8,
    mesh: "server",
    color: "#16161c",
    glow: "#3aff8a",
    class: "network",
    armor: 30,
    backups: { everySeconds: 6, unit: "tech_backup", count: 2, electricianRange: 9 },
  },
  boss_datacenter: {
    id: "boss_datacenter",
    label: "THE DATA CENTER",
    blurb: "The final boss. On mains power it shrugs off most damage: an Electrician must cut it off.",
    health: 3800,
    speed: 0.7,
    bounty: 40,
    leak: 12,
    scale: 2.6,
    mesh: "datacenter",
    color: "#2a2f3a",
    glow: "#3ab0ff",
    class: "network",
    armor: 20,
    overheats: { radius: 6, rateFactor: 0.75 },
    power: { max: 500, poweredDamage: 0.3, electricianRange: 9, drainPerSecond: 18, spawn: { unit: "tech_phone", everySeconds: 5 } },
    becomes: "boss_cloud",
  },
  boss_cloud: {
    id: "boss_cloud",
    label: "THE CLOUD",
    blurb: "The Data Center's final form. It flies.",
    health: 1900,
    speed: 1.3,
    bounty: 60,
    leak: 12,
    scale: 2.4,
    mesh: "cloud",
    color: "#f0f4ff",
    glow: "#7ab8ff",
    class: "wireless",
    armor: 0,
    flying: true,
  },
};

export function creepName(id: string): string {
  return CREEP_CATALOG[id]?.label ?? id;
}

export function creepDef(id: string): CreepDef {
  const def = CREEP_CATALOG[id];
  if (def === undefined) throw new Error(`beacon-bastion: unknown tech id "${id}"`);
  return def;
}

/** The traits a wave preview names: what a player has to bring an answer for. */
export function creepTraits(id: string): readonly string[] {
  const def = CREEP_CATALOG[id];
  if (def === undefined) return [];
  const traits: string[] = [];
  if (def.flying === true) traits.push("flying");
  if (def.armor >= 30) traits.push("armored");
  if (def.notify !== undefined) traits.push("notifies");
  if (def.spots !== undefined) traits.push("spots");
  if (def.overheats !== undefined) traits.push("overheats");
  if (def.shield !== undefined) traits.push("shielded");
  if (def.heals !== undefined || def.boosts !== undefined) traits.push("boosts");
  if (def.splits !== undefined || def.backups !== undefined) traits.push("splits");
  if (def.power !== undefined) traits.push("powered");
  return traits;
}
