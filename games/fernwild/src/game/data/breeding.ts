import type { BreedingSpecies } from "@jgengine/core/breeding/breeding";

import type { TameStat } from "./species";

/** "h:mm" or "Nd h:mm", as the ARK wiki writes its breeding times, in seconds. */
function time(text: string): number {
  const match = /^(?:(\d+)d )?(\d+):(\d\d)$/.exec(text);
  if (match === null) throw new Error(`breeding time ${text}`);
  return Number(match[1] ?? 0) * 86_400 + Number(match[2]) * 3600 + Number(match[3]) * 60;
}

/** ARK's mating interval for every Island species here: 18 to 48 hours. */
const COOLDOWN = [time("18:00"), time("48:00")] as const;
/** ARK gives no mating time; about a minute of standing together is the in-game feel (approximate). */
const MATE_SECONDS = 60;

type Row = [mode: "egg" | "gestation", incubation: readonly [number, number] | null, carry: string, maturation: string];

/**
 * The ARK wiki's breeding table (ark.wiki.gg/wiki/Breeding) for each Island species here: egg or gestation, the egg's
 * incubation range in °C, incubation or gestation time and total maturation time at ARK's default speeds. Titanoboa and
 * Leech are sterile; Titanomyrma and Meganeura do not breed.
 */
const ROWS: Readonly<Record<string, Row>> = {
  dodo: ["egg", [22, 30], "0:49", "15:25"],
  raptor: ["egg", [20, 28], "1:59", "1d 13:02"],
  phiomia: ["gestation", null, "9:55", "2d 00:43"],
  carnotaurus: ["egg", [26, 32], "1:39", "1d 22:17"],
  triceratops: ["egg", [22, 28], "2:29", "1d 22:17"],
  stegosaurus: ["egg", [22, 28], "2:46", "2d 03:26"],
  parasaur: ["egg", [24, 28], "1:25", "1d 02:27"],
  megaloceros: ["gestation", null, "6:06", "2d 23:13"],
  pteranodon: ["egg", [29, 32], "1:39", "1d 13:02"],
  rex: ["egg", [32, 34], "4:59", "3d 20:35"],
  dilophosaur: ["egg", [28, 32], "1:08", "21:02"],
  pachy: ["egg", [24, 28], "1:25", "1d 02:27"],
  direwolf: ["gestation", null, "4:10", "2d 00:43"],
  chalicotherium: ["gestation", null, "7:56", "3d 10:18"],
  terror_bird: ["egg", [20, 28], "1:59", "1d 22:17"],
  gigantopithecus: ["gestation", null, "6:36", "3d 05:09"],
  ovis: ["gestation", null, "4:10", "2d 00:43"],
  purlovia: ["gestation", null, "4:10", "2d 00:43"],
  troodon: ["egg", [28, 32], "1:08", "21:02"],
  ankylosaurus: ["egg", [16, 20], "2:37", "2d 00:43"],
  argentavis: ["egg", [12, 13.5], "2:56", "2d 06:27"],
  doedicurus: ["gestation", null, "4:57", "2d 09:52"],
  allosaurus: ["egg", [26, 32], "1:39", "1d 22:17"],
  woolly_rhino: ["gestation", null, "3:58", "2d 09:52"],
  mammoth: ["gestation", null, "7:56", "3d 10:18"],
  yutyrannus: ["egg", [32, 34], "4:59", "7d 17:11"],
  sabertooth: ["gestation", null, "4:10", "2d 00:43"],
  kairuku: ["egg", [22, 30], "1:30", "1d 04:03"],
  pachyrhinosaurus: ["egg", [22, 28], "2:29", "1d 22:17"],
  thylacoleo: ["gestation", null, "4:10", "2d 00:43"],
  direbear: ["gestation", null, "3:58", "1d 22:17"],
  lystrosaurus: ["egg", [24, 28], "0:49", "15:25"],
  moschops: ["egg", [16, 20], "2:37", "2d 00:43"],
  compy: ["egg", [24, 32], "0:49", "21:02"],
  paraceratherium: ["gestation", null, "7:56", "3d 20:35"],
  equus: ["gestation", null, "7:56", "1d 22:17"],
  gallimimus: ["egg", [24, 28], "1:25", "1d 02:27"],
  castoroides: ["gestation", null, "7:56", "2d 13:43"],
  araneo: ["egg", [4, 12], "1:25", "1d 01:01"],
  dimetrodon: ["egg", [30, 34], "2:29", "1d 22:17"],
  kaprosuchus: ["egg", [29, 35], "1:59", "1d 13:02"],
  sarco: ["egg", [30, 34], "2:29", "1d 22:17"],
  beelzebufo: ["egg", [0, 50], "4:59", "1d 13:02"],
  diplocaulus: ["egg", [0, 50], "4:59", "1d 13:02"],
  baryonyx: ["egg", [29, 35], "1:59", "1d 22:17"],
  arthropleura: ["egg", [18, 22], "2:29", "2d 03:26"],
  pulmonoscorpius: ["egg", [12, 16], "1:59", "1d 13:02"],
  megalania: ["egg", [29, 35], "1:59", "1d 13:02"],
  brontosaurus: ["egg", [28, 31], "4:59", "3d 20:35"],
  diplodocus: ["egg", [26, 29], "4:59", "3d 20:35"],
  iguanodon: ["egg", [24, 28], "1:25", "1d 22:17"],
};

/** How a species breeds, or null for one that cannot. A pair must stand within two body widths and a bit (approximate). */
export function breedingOf(species: string, radius: number): BreedingSpecies | null {
  const row = ROWS[species];
  if (row === undefined) return null;
  const [mode, incubation, carry, maturation] = row;
  return { mode, incubation, carrySeconds: time(carry), maturationSeconds: time(maturation), mateSeconds: MATE_SECONDS, mateRange: radius * 2 + 2, cooldownSeconds: COOLDOWN };
}

/** ARK's imprint interval: a baby asks for care every 8 hours. */
export const CARE_INTERVAL = time("8:00");
/** What a baby asks for. ARK asks for a cuddle, a walk or a kibble; Fernwild has no kibble, so it asks for its favourite food. */
export const CARE_KINDS = ["cuddle", "walk", "feed"] as const;
/** Metres a baby must follow you for a walk (approximate). */
export const WALK_METRES = 30;
/** Full imprint raises every stat but stamina, oxygen and speed by 20% (ARK). */
export const IMPRINT_BONUS = 0.2;
export const IMPRINTED_STATS: readonly TameStat[] = ["health", "food", "weight", "melee"];
/** An egg out of its temperature survives this long (approximate: ARK drains an egg's health over minutes). */
export const EGG_HEALTH_SECONDS = 600;
/** ARK's mutations: three rolls at 2.5%, each two more levels in one stat. */
export const MUTATIONS = { rolls: 3, chance: 0.025, levels: 2 } as const;
/** How big a newborn is next to its parents; it grows to full size as it matures (approximate). */
export const NEWBORN_SIZE = 0.25;
/**
 * A baby eats from its own inventory, fast while small: ARK's FoodPerSec = R x (1 - maturation). R here empties a
 * newborn's full food in about 40 minutes (approximate; ARK's R is per species). A newborn starts with a tenth.
 */
export const BABY_FOOD_DRAIN_SECONDS = 2400;
export const NEWBORN_FOOD = 0.1;
/** What a creature's food stat gains from each item it eats (ARK: meat 50, berries 20 to 30; approximate). */
export const CREATURE_FOOD: Readonly<Record<string, { diet: "herbivore" | "carnivore"; food: number }>> = {
  raw_prime_meat: { diet: "carnivore", food: 50 },
  raw_meat: { diet: "carnivore", food: 50 },
  cooked_meat: { diet: "carnivore", food: 50 },
  mejoberry: { diet: "herbivore", food: 30 },
  amarberry: { diet: "herbivore", food: 20 },
  azulberry: { diet: "herbivore", food: 20 },
  tintoberry: { diet: "herbivore", food: 20 },
};
