import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { breedingView } from "../breeding";
import { airliftView, awakeTamingProgress, creatureCard, creaturesView, lastTame, lineageStrays, mountSwim, nearestCarcass, nearestTame, nearestTameStance, nearestThreat, nearestWild, speciesNear, wildCountNear, wildHurtNear, wildLevelNear } from "../creatures";
import { PREY } from "../onboarding";
import { tameFood } from "../tameHunger";
import type { ProbeFrame } from "./frame";

/** Animals only the northern snow keeps, and only the south-coast beach keeps: what the biome probes count. */
const SNOW_KINDS = new Set(["woolly_rhino", "mammoth", "sabertooth", "ovis", "kairuku", "yutyrannus", "purlovia"]);
const COAST_KINDS = new Set(["dodo", "phiomia", "lystrosaurus", "parasaur", "dilophosaur", "moschops", "compy", "pachy"]);

/** What proofs and flows read about creatures: its part of the capture probe. */
export function creaturesProbe(ctx: GameContext, { me, here, sight }: ProbeFrame) {
  const creatures = creaturesView(ctx);
  const breeding = breedingView(ctx);
  return {
    // The dossier: species met, items held and notes read, each of how many the island has; engrams learned of all.
    // The highest wild level within 120 m: what the danger-by-distance proof reads.
    wildLevelNear: wildLevelNear(ctx, here, 120),
    // (passing over prey grazing within 30 m of a hunter, as a survivor with a spear would).
    ...sight("prey", nearestWild(ctx, PREY, here, 220, (at) => nearestThreat(ctx, at, 30) === null)),
    // The nearest wild Ovis within 30 m, a passive tame to follow and hand-feed.
    ...sight("ovis", nearestWild(ctx, "ovis", here, 30)),
    ...sight("dodo", nearestWild(ctx, "dodo", here, 30)),
    // Live wild creatures within 60 m: what the herd-refill proof counts.
    wildNear: wildCountNear(ctx, here, 60),
    // The nearest wild hunter within 60 m, and how many creatures a bola or trap holds still.
    ...sight("threat", nearestThreat(ctx, here, 60)),
    held: creatures.held,
    // The nearest body left to carve within 10 m.
    ...sight("carcass", nearestCarcass(ctx, here, 10)),
    // The nearest wild hunter within 40 m, the one to keep clear of.
    ...sight("danger", nearestThreat(ctx, here, 40)),
    // The nearest tamed Phiomia, to walk back to with its saddle.
    ...sight("phiomia", nearestTame(ctx, here, "phiomia")),
    ...sight("raptor", nearestTame(ctx, here, "raptor")),
    ...sight("doedicurus", nearestTame(ctx, here, "doedicurus")),
    creatures: creatures.count,
    aimedDown: creatures.aimed?.taming?.unconscious === true ? 1 : 0,
    aimedTorpor: creatures.aimed?.taming?.torpor ?? 0,
    // Metres between the survivor's and the aimed creature's centres, to a decimetre; 0 with nothing aimed.
    aimedGap: creatures.aimed === null || me === null ? 0 : Math.round((ctx.scene.entity.distance(me.id, creatures.aimed.id) ?? 0) * 10) / 10,
    // 1 while the creature in front is wild (alive or a body to carve), 0 for a tame or nothing.
    aimedWild: creatures.aimed !== null && !creatures.aimed.tamed ? 1 : 0,
    // 1 while the creature in front is a live wild hunter (aggressive or territorial) that will fight back.
    aimedThreat: creatures.aimed !== null && !creatures.aimed.tamed && !creatures.aimed.dead && (creatures.aimed.temperament === "aggressive" || creatures.aimed.temperament === "territorial") ? 1 : 0,
    // The aimed creature's health; 0 with nothing aimed or a body.
    aimedHealth: creatures.aimed?.health.value ?? 0,
    // The aimed tame's food in percent of its max; -1 with no tame aimed.
    aimedFood: creatures.aimed === null ? -1 : Math.round(((food) => (food === null ? -0.01 : food.value / food.max))(tameFood(ctx, creatures.aimed.id)) * 100),
    down: creatures.down,
    tamed: creatures.tamed,
    tameProgress: Math.round((creatures.viewing?.taming?.progress ?? creatures.aimed?.taming?.progress ?? 0) * 100),
    lastTameEffectiveness: Math.round((lastTame(ctx)?.effectiveness ?? -0.01) * 100),
    lastTameBonus: lastTame(ctx)?.bonus ?? -1,
    // The most taming progress, in percent, an awake wild creature still holds (waking should leave none).
    awakeProgress: Math.round(awakeTamingProgress(ctx) * 100),
    riding: creatures.riding === null ? 0 : 1,
    // 1 while the ridden mount is in deep water, and 1 when it is one of the swimmers.
    ...((swim) => ({ mountSwimming: swim.swimming ? 1 : 0, mountSwimmer: swim.swimmer ? 1 : 0 }))(mountSwim(ctx)),
    // Whether the ridden flyer holds a creature, that creature's height above the ground (-1 with none), and how far the
    // last creature lifted now is from where it was lifted (-1 with none).
    ...((lift) => ({ lifting: lift.holding === null ? 0 : 1, liftedAlt: Math.round(lift.heldAlt * 10) / 10, liftMoved: Math.round(lift.liftMoved * 10) / 10 }))(airliftView(ctx)),
    // The weight the open or ridden tame carries, and its stone (-1 with neither); the bag's stone slot.
    tameWeight: (creatures.viewing ?? creatures.riding)?.weight.value ?? -1,
    tameStone: ((card) => (card === null ? -1 : card.inventory.reduce((sum, slot) => sum + (slot?.itemId === "stone" ? slot.count : 0), 0)))(creatures.viewing ?? creatures.riding),
    saddled: creatures.aimed?.saddled === true ? 1 : 0,
    tameLevel: creatures.viewing?.level ?? creatures.riding?.level ?? 0,
    tamePoints: creatures.viewing?.growth?.unspent ?? 0,
    tameHealthMax: creatures.viewing?.health.max ?? 0,
    mountStamina: creatures.riding?.stamina.value ?? 0,
    mountStaminaMax: creatures.riding?.stamina.max ?? 0,
    // How many of the snow's own animals, and how many of the south-coast beach's, live within 120 m.
    nearSnowKinds: [...speciesNear(ctx, here, 120)].filter((species) => SNOW_KINDS.has(species)).length,
    nearCoastKinds: [...speciesNear(ctx, here, 120)].filter((species) => COAST_KINDS.has(species)).length,
    // Wild creatures within 40 m that have been hurt or killed, and your nearest tame's stance (0 passive, 1 neutral, 2 aggressive; -1 with none).
    wildHurt: wildHurtNear(ctx, here, 40),
    tameStance: nearestTameStance(ctx, here),
    // The newest baby's lineage as its card shows it: stats from its mother, from its father, and raised by a mutation, and
    // its stats that match neither parent once mutations are taken off (-1 with no baby).
    babyStrays: breeding.baby === null ? -1 : lineageStrays(ctx, breeding.baby.id),
    ...((lineage) => ({
      babyFromMother: lineage === null ? -1 : lineage.filter((row) => row.from === "mother").length,
      babyFromFather: lineage === null ? -1 : lineage.filter((row) => row.from === "father").length,
      babyMutated: lineage === null ? -1 : lineage.filter((row) => row.mutated).length,
    }))(breeding.baby === null ? null : (creatureCard(ctx, breeding.baby.id)?.lineage ?? null)),
  };
}
