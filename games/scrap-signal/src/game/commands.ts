import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_LABELS, AMMO_STAT_IDS, type AmmoPool } from "./ammo";
import { buyGear, spend } from "./cash";
import { gearById, AMMO_PRICES } from "./items/gear/catalog";
import { noteShotNoise, stageFrontBoss, stageFrontFight } from "./encounters/front";
import { stageRelay } from "./relay";
import { noteRunStarted } from "./bootPhase";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { activeCharacter, characterById, pickCharacter, resetCharacterState, talentTree, bonus } from "./characters";
import { scrapSave } from "./save";
import { captureScrapThumb, scrapProfile } from "./scrapProfile";
import { refreshScrapSlots } from "./scrapSlots";
import { noteEquipped } from "./feel";
import { gunById, rarityRank, rollGun, startReload, reservePhase } from "./handroll";
import { depositGun, vaultOpenStore, withdrawGun } from "./items/vault";
import { openAmmoCrate } from "./items/ammoCrates";
import { playerDef } from "./entities/players/catalog";
import { session } from "./session";
import { chestDropSpot } from "./items/chestDrops";
import { noteGunHeld } from "./progression/discovery";
import { award, isUnlocked, openWeaponSlots, rarityCapFor, SKILLS_LEVEL, unlock } from "./progression/unlocks";
import { CRASH_CHEST, isNpcId, QUEST_IDS } from "./quests/catalog";
import { acceptOffer, creditObjective, npcDialogStore, talkTo } from "./quests/givers";
import {
  blackMarketOpenStore,
  blackMarketStore,
  characterIdStore,
  discoveredStationsStore,
  lastPickupStore,
  openedChestsStore,
  skillsOpenStore,
  talentRanksStore,
  travelOpenStore,
  vendorOpenStore,
} from "./stores";
import { TRAVEL_STATIONS } from "./world/sites";
import { zoneLevelAt } from "./world/zones";

export const BLACK_MARKET_UPGRADES = [
  { id: "ammo", name: "Ammo SDU", blurb: "+30% max ammo, every pool" },
  { id: "health", name: "Health SDU", blurb: "+25 max health" },
  { id: "shield", name: "Shield SDU", blurb: "+25 max shield" },
  { id: "grenade", name: "Grenade SDU", blurb: "+1 grenade capacity" },
] as const;

export type BlackMarketCounts = Record<string, number>;

/** Cash a full talent refund costs: it grows with level, so a build is a choice and not a toggle. */
export function respecCost(level: number): number {
  return 75 * Math.max(1, level);
}

export function upgradeCost(count: number): number {
  return 4 + count * 4;
}

const PICKUP_RADIUS = 2.8;
/** The crash chest's pistol: a plain budget maker, so the first gun is honest and the next one is better. */
const STARTER_MAKER = "Chuckwerk";
const chestRng = seededRng("scrap-red-chests");

interface AimPayload {
  aim?: { yaw: number; pitch: number };
}

export function selectedGunId(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const stack = slots[session.selectedSlot()];
  return stack?.itemId ?? null;
}

function playerLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
}

/** How far off the facing direction (radians) an item still counts as the one being looked at. */
const LOOK_CONE = Math.PI / 3;
/** A drop this close is under your feet: the one you mean. */
export const STAND_ON = 0.6;
/** Drops this close in score are one pile: E takes the best of it, not whichever landed first. */
const PILE_SPREAD = 0.08;

function pileRank(itemId: string): number {
  const gun = gunById(itemId);
  return gun === undefined ? 0 : 1 + rarityRank(gun.rarity);
}

/**
 * The drop E takes: the one you stand on, else the one in reach closest to where the player is facing,
 * else the nearest. Out of a pile (drops at the same spot) it takes the rarest gun.
 */
export function lookedAtItem(ctx: GameContext, from: readonly [number, number, number], yaw: number): string | null {
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestRank = -1;
  for (const item of ctx.scene.worldItem.list()) {
    const at = ctx.scene.entity.get(item.instanceId)?.position;
    if (at === undefined) continue;
    const dx = at[0] - from[0];
    const dz = at[2] - from[2];
    const distance = Math.hypot(dx, dz);
    if (distance > PICKUP_RADIUS) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw)));
    // What you stand on comes first, then what is in front by angle, then the rest by distance. A gun
    // you just swapped out lands behind you, so it never comes first.
    const score = distance < STAND_ON ? distance - 1 : off < LOOK_CONE ? off : LOOK_CONE + distance;
    const rank = pileRank(item.itemId);
    const tied = Math.abs(score - bestScore) < PILE_SPREAD;
    if (tied ? rank > bestRank : score < bestScore) {
      bestScore = Math.min(score, bestScore);
      bestRank = rank;
      best = item.instanceId;
    }
  }
  return best;
}

function pickupWorldItem(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(userId);
  if (playerEntity === null) return;
  const targetId = lookedAtItem(ctx, playerEntity.position, playerEntity.rotationY);
  if (targetId === null) return;
  const record = ctx.scene.worldItem.get(targetId);
  if (record === null) return;

  const gun = gunById(record.itemId);
  if (gun !== undefined) {
    const slots = ctx.player.inventory.state("hotbar").slots;
    const open = openWeaponSlots(ctx);
    if (open === 0) {
      award(ctx, unlock.slot(1));
      ctx.scene.entity.floatText({ instanceId: userId, text: "WEAPON SLOT 1 ONLINE", kind: "pickup" });
    }
    const empty = slots.findIndex((stack, index) => index < Math.max(1, open) && stack === null);
    const slot = empty >= 0 ? empty : Math.min(session.selectedSlot(), Math.max(1, open) - 1);
    const current = slots[slot] ?? null;
    ctx.scene.worldItem.consume(record.instanceId);
    if (current !== null) {
      ctx.player.inventory.take("hotbar", current.itemId, current.count);
      const held = gunById(current.itemId);
      // The gun you put down lands a step behind you, out of the way of the next one in front.
      const back = playerEntity.rotationY + Math.PI;
      ctx.scene.worldItem.spawn({
        itemId: current.itemId,
        position: [playerEntity.position[0] + Math.sin(back) * 1.2, playerEntity.position[1], playerEntity.position[2] + Math.cos(back) * 1.2],
        ...(held === undefined ? {} : { rarity: held.rarity, baseType: held.family }),
        source: "swap",
      });
    }
    ctx.player.inventory.put("hotbar", gun.id, 1, { slot });
    session.selectSlot(ctx, slot);
    noteEquipped(gun.id);
    lastPickupStore.write(ctx, { gunId: gun.id, atMs: ctx.time.now() * 1000 });
    ctx.scene.entity.floatText({ instanceId: userId, text: gun.name.toUpperCase(), kind: "pickup" });
    ctx.game.feed.push("loot.pickup", { itemId: gun.id, rarity: gun.rarity });
    noteGunHeld(ctx, gun);
    creditObjective(ctx, "pickup", "gun");
    return;
  }

  const gear = gearById(record.itemId);
  if (gear === undefined) return;
  if (gear.kind === "ammo" && gear.ammo !== undefined && gear.ammoAmount !== undefined) {
    const statId = AMMO_STAT_IDS[gear.ammo];
    const pool = ctx.scene.entity.stats.get(userId, statId);
    if (pool !== null && pool.current >= pool.max) {
      ctx.scene.entity.floatText({ instanceId: userId, text: "AMMO FULL", kind: "warn" });
      return;
    }
    ctx.scene.worldItem.consume(record.instanceId);
    ctx.scene.entity.stats.delta(userId, statId, gear.ammoAmount * record.count);
    ctx.scene.entity.floatText({ instanceId: userId, text: `+${gear.ammoAmount * record.count} ${gear.name.toUpperCase()}`, kind: "pickup" });
    return;
  }
  const result = ctx.player.inventory.put("backpack", gear.id, record.count);
  if (result.status !== "ok") {
    ctx.scene.entity.floatText({ instanceId: userId, text: "PACK FULL", kind: "warn" });
    return;
  }
  ctx.scene.worldItem.consume(record.instanceId);
  ctx.scene.entity.floatText({ instanceId: userId, text: gear.name.toUpperCase(), kind: "pickup" });
}

function claimChest(ctx: GameContext, instanceId: string): boolean {
  const opened = openedChestsStore.read(ctx);
  if (opened.includes(instanceId)) {
    ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "CHEST EMPTY", kind: "warn" });
    return false;
  }
  openedChestsStore.write(ctx, [...opened, instanceId]);
  return true;
}

/** The crash chest holds the crew's spare pistol, and stays shut until Bolt sends you to it. */
function crashChestShut(ctx: GameContext): boolean {
  const entry = ctx.game.quest?.list(ctx.player.userId).find((candidate) => candidate.questId === QUEST_IDS.firstGun);
  return entry === undefined;
}

function openRedChest(ctx: GameContext, instanceId: string): void {
  const crash = instanceId === CRASH_CHEST;
  if (crash && crashChestShut(ctx)) {
    ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "LOCKED · TALK TO B0-LT", kind: "warn" });
    return;
  }
  if (!claimChest(ctx, instanceId)) return;
  creditObjective(ctx, "chest", instanceId);
  const object = ctx.scene.object.get(instanceId);
  const at = object?.position ?? ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
  if (crash) {
    const pistol = rollGun(chestRng, 1, { family: "pistol", rarity: "common", maker: STARTER_MAKER });
    ctx.scene.worldItem.spawn({
      itemId: pistol.id,
      position: chestDropSpot(ctx, at, 0, 1),
      rarity: pistol.rarity,
      baseType: pistol.family,
      source: "chest",
    });
    return;
  }
  const chestLevel = Math.max(playerLevel(ctx), zoneLevelAt(at[0], at[2]));
  const rolls = 2;
  for (let roll = 0; roll < rolls; roll += 1) {
    const gun = rollGun(chestRng, chestLevel, { luck: 4, maxRarity: rarityCapFor(playerLevel(ctx)) });
    ctx.scene.worldItem.spawn({
      itemId: gun.id,
      position: chestDropSpot(ctx, at, roll, rolls),
      rarity: gun.rarity,
      baseType: gun.family,
      source: "chest",
    });
  }
}

/** The aim a command carries, as an optional field a use input can spread in. */
function aimOf(input: AimPayload): { aim?: NonNullable<AimPayload["aim"]> } {
  return input.aim === undefined ? {} : { aim: input.aim };
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<AimPayload>("fire", {
    apply(state: GameContext, input) {
      if (reservePhase(state) === "dead") return;
      const itemId = selectedGunId(state);
      if (itemId === null) return;
      const result = state.item.use.use({ from: state.player.userId, itemId, inventoryId: "hotbar", ...aimOf(input) });
      // A shot that actually left the barrel is a noise the whole battlefield can hear; a dry
      // click is not.
      if (result.error === undefined) noteShotNoise(state, itemId);
    },
  });

  ctx.game.commands.define("reload", {
    apply(state: GameContext) {
      const itemId = selectedGunId(state);
      if (itemId === null) return;
      const gun = gunById(itemId);
      if (gun === undefined) return;
      startReload(state, gun);
    },
  });

  for (const slot of [0, 1, 2, 3]) {
    ctx.game.commands.define(`selectSlot${slot + 1}`, {
      apply(state: GameContext) {
        if (slot >= openWeaponSlots(state)) {
          state.scene.entity.floatText({ instanceId: state.player.userId, text: `WEAPON SLOT ${slot + 1} LOCKED`, kind: "warn" });
          return;
        }
        session.selectSlot(state, slot);
        noteEquipped(selectedGunId(state));
      },
    });
  }

  ctx.game.commands.define<AimPayload>("throwGrenade", {
    apply(state: GameContext, input) {
      state.item.use.use({ from: state.player.userId, itemId: "frag_grenade", inventoryId: "backpack", ...aimOf(input) });
    },
  });

  ctx.game.commands.define("useHealthVial", {
    apply(state: GameContext) {
      const itemId =
        state.player.inventory.count("backpack", "insta_health_big") > 0 ? "insta_health_big" : "insta_health";
      state.item.use.use({ from: state.player.userId, itemId, inventoryId: "backpack" });
    },
  });

  ctx.game.commands.define("pickup", {
    apply(state: GameContext) {
      pickupWorldItem(state);
    },
  });

  ctx.game.commands.define<{ instanceId?: string }>("chest.openRed", {
    apply(state: GameContext, input) {
      if (input.instanceId !== undefined) openRedChest(state, input.instanceId);
    },
  });

  ctx.game.commands.define<{ instanceId?: string }>("chest.openAmmo", {
    apply(state: GameContext, input) {
      if (input.instanceId !== undefined) openAmmoCrate(state, input.instanceId);
    },
  });

  ctx.game.commands.define<{ vendor?: string }>("vendor.open", {
    apply(state: GameContext, input) {
      if (input.vendor !== undefined) vendorOpenStore.write(state, input.vendor);
    },
  });

  ctx.game.commands.define("vendor.close", {
    apply(state: GameContext) {
      vendorOpenStore.clear(state);
    },
  });

  ctx.game.commands.define("vault.open", {
    apply(state: GameContext) {
      vaultOpenStore.write(state, true);
    },
  });

  ctx.game.commands.define("vault.close", {
    apply(state: GameContext) {
      vaultOpenStore.clear(state);
    },
  });

  ctx.game.commands.define<{ slot?: number }>("vault.deposit", {
    apply(state: GameContext, input) {
      if (typeof input.slot === "number") depositGun(state, input.slot);
    },
  });

  ctx.game.commands.define<{ itemId?: string }>("vault.withdraw", {
    apply(state: GameContext, input) {
      if (input.itemId !== undefined) withdrawGun(state, input.itemId);
    },
  });

  ctx.game.commands.define<{ itemId?: string }>("vendor.buyGear", {    apply(state: GameContext, input) {
      if (input.itemId === undefined) return;
      const rejection = buyGear(state, input.itemId);
      if (rejection !== null) {
        state.game.notices.push({ text: "Not enough cash.", tone: "deny" });
      }
    },
  });

  ctx.game.commands.define<{ pool?: AmmoPool }>("vendor.buyAmmo", {
    apply(state: GameContext, input) {
      if (input.pool === undefined) return;
      const price = AMMO_PRICES[input.pool];
      const userId = state.player.userId;
      const statId = AMMO_STAT_IDS[input.pool];
      const stat = state.scene.entity.stats.get(userId, statId);
      if (stat !== null && stat.current >= stat.max) {
        state.game.notices.push({ text: `${AMMO_LABELS[input.pool]} ammo is full.`, tone: "deny" });
        return;
      }
      const rejection = spend(state, "cash", price.cash, "ammo-purchase", input.pool);
      if (!rejection) {
        state.game.notices.push({ text: "Not enough cash.", tone: "deny" });
        return;
      }
      state.scene.entity.stats.delta(userId, statId, price.amount);
    },
  });

  ctx.game.commands.define<{ vendor?: string }>("vendor.gunOfTheDay", {
    apply(state: GameContext, input) {
      const userId = state.player.userId;
      const paid = spend(state, "cash", 300, "gun-of-the-day", input.vendor ?? "vendor");
      if (!paid) {
        state.game.notices.push({ text: "Not enough cash.", tone: "deny" });
        return;
      }
      const gun = rollGun(chestRng, playerLevel(state), { luck: 6, maxRarity: rarityCapFor(playerLevel(state)) });
      const playerEntity = state.scene.entity.get(userId);
      const at = playerEntity?.position ?? [0, 0, 0];
      state.scene.worldItem.spawn({
        itemId: gun.id,
        position: [at[0] + 1.2, at[1], at[2] + 1.2],
        rarity: gun.rarity,
        baseType: gun.family,
        source: input.vendor ?? "vendor",
      });
    },
  });

  ctx.game.commands.define<{ npc?: string }>("npc.talk", {
    apply(state: GameContext, input) {
      const npc = input.npc;
      if (npc !== undefined && isNpcId(npc)) talkTo(state, npc);
    },
  });

  ctx.game.commands.define("quest.acceptOffer", {
    apply(state: GameContext) {
      acceptOffer(state);
    },
  });

  ctx.game.commands.define("npc.close", {
    apply(state: GameContext) {
      npcDialogStore.clear(state);
    },
  });

  ctx.game.commands.define("blackmarket.open", {
    apply(state: GameContext) {
      blackMarketOpenStore.write(state, true);
    },
  });

  ctx.game.commands.define("blackmarket.close", {
    apply(state: GameContext) {
      blackMarketOpenStore.clear(state);
    },
  });

  ctx.game.commands.define("travel.open", {
    apply(state: GameContext) {
      travelOpenStore.write(state, true);
    },
  });

  ctx.game.commands.define("travel.close", {
    apply(state: GameContext) {
      travelOpenStore.clear(state);
    },
  });

  ctx.game.commands.define<{ zoneId?: string }>("travel.go", {
    apply(state: GameContext, input) {
      if (reservePhase(state) === "downed") return;
      const station = TRAVEL_STATIONS.find((candidate) => candidate.zoneId === input.zoneId);
      if (station === undefined) return;
      const discovered = discoveredStationsStore.read(state);
      if (!discovered.includes(station.zoneId)) return;
      const y = state.world.groundHeightAt(station.x + 3, station.z + 3);
      state.scene.entity.update(state.player.userId, { position: [station.x + 3, y, station.z + 3] });
      travelOpenStore.clear(state);
      state.scene.entity.floatText({ instanceId: state.player.userId, text: station.name.toUpperCase(), kind: "pickup" });
    },
  });

  ctx.game.commands.define<{ upgrade?: string }>("blackmarket.buy", {
    apply(state: GameContext, input) {
      const upgrade = BLACK_MARKET_UPGRADES.find((candidate) => candidate.id === input.upgrade);
      if (upgrade === undefined) return;
      const userId = state.player.userId;
      const counts = { ...blackMarketStore.read(state) };
      const owned = counts[upgrade.id] ?? 0;
      const cost = upgradeCost(owned);
      const paid = spend(state, "cores", cost, "black-market-upgrade", upgrade.id);
      if (!paid) {
        state.game.notices.push({ text: "Not enough cores.", tone: "deny" });
        return;
      }
      counts[upgrade.id] = owned + 1;
      blackMarketStore.write(state, counts);
      if (upgrade.id === "ammo") {
        for (const statId of Object.values(AMMO_STAT_IDS)) {
          const stat = state.scene.entity.stats.get(userId, statId);
          if (stat !== null) state.scene.entity.stats.set(userId, statId, { max: Math.round(stat.max * 1.3) });
        }
      } else if (upgrade.id === "health" || upgrade.id === "shield") {
        const statId = upgrade.id;
        const stat = state.scene.entity.stats.get(userId, statId);
        if (stat !== null) {
          state.scene.entity.stats.set(userId, statId, { max: stat.max + 25 });
          state.scene.entity.stats.delta(userId, statId, 25);
        }
      } else if (upgrade.id === "grenade") {
        const stat = state.scene.entity.stats.get(userId, "grenades");
        if (stat !== null) {
          state.scene.entity.stats.set(userId, "grenades", { max: stat.max + 1 });
          state.scene.entity.stats.delta(userId, "grenades", 1);
        }
      }
      state.scene.entity.floatText({ instanceId: userId, text: `${upgrade.name.toUpperCase()} ACQUIRED`, kind: "pickup" });
    },
  });

  ctx.game.commands.define("ui.openSkills", {
    apply(state: GameContext) {
      const open = skillsOpenStore.read(state);
      if (!open && !isUnlocked(state, unlock.skills)) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: `SKILL TREE OPENS AT LEVEL ${SKILLS_LEVEL}`, kind: "warn" });
        return;
      }
      if (open) skillsOpenStore.clear(state);
      else skillsOpenStore.write(state, true);
    },
  });

  // The menu's own verbs: keep the run where it stands, and open a kept one.
  ctx.game.commands.define<{ slot?: string }>("run.save", {
    apply(state, input) {
      // A call sign the player typed is the run's name; only fall back to the reclaimer's when empty.
      scrapProfile.name = scrapProfile.name ?? activeCharacter()?.name ?? null;
      void captureScrapThumb().then(async () => {
        const save = scrapSave(state);
        if (typeof input?.slot === "string" && input.slot !== save.slot()) await save.switchSlot(input.slot, { flush: false });
        await save.save();
        await refreshScrapSlots(state);
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "SIGNAL KEPT", kind: "pickup" });
      });
      return state;
    },
  });
  ctx.game.commands.define<{ slot?: string }>("run.continue", {
    apply(state, input) {
      noteRunStarted(state);
      void (async () => {
        const save = scrapSave(state);
        if (typeof input?.slot === "string" && input.slot !== save.slot()) await save.switchSlot(input.slot, { flush: false });
        await save.load();
        if (activeCharacter() === null) return;
        setGamePhase(state, "playing");
        state.time.play();
      })();
      return state;
    },
  });
  if (import.meta.env.DEV) {
    // The menu states a capture host reaches: keep a run, then stand at the carrier.
    ctx.game.commands.define<{ characterId?: string; name?: string }>("menu.run", {
      apply(state, input) {
        const id = input?.characterId ?? "gunk";
        const def = characterById(id);
        if (def === undefined) return state;
        scrapProfile.name = input?.name ?? def.name;
        noteRunStarted(state);
        pickCharacter(def.id);
        characterIdStore.write(state, def.id);
        applyPassiveEffects(state);
        setGamePhase(state, "playing");
        state.time.play();
        return state;
      },
    });
    ctx.game.commands.define("menu.title", {
      apply(state) {
        resetCharacterState();
        characterIdStore.write(state, null);
        setGamePhase(state, "menu");
        state.time.pause();
        return state;
      },
    });
  }
  ctx.game.commands.define<{ characterId?: string; slot?: string }>("character.pick", {
    apply(state: GameContext, input) {
      const def = characterById(input.characterId ?? "");
      if (def === undefined) return;
      // A pick only starts a run from the front end: a restored run waits behind the menu, so the
      // menu's New run replaces its reclaimer. Mid-run, the roster is not reachable and a pick is
      // ignored.
      if (activeCharacter() !== null && gamePhase(state) !== "menu") return;
      // The bay the player chose in the menu owns the kept run, so a checkpoint lands in a slot the
      // menu lists instead of the document's default one.
      const save = scrapSave(state, input.slot);
      if (typeof input.slot === "string" && input.slot !== save.slot()) {
        void save.switchSlot(input.slot, { flush: false }).then(() => refreshScrapSlots(state));
      }
      noteRunStarted(state);
      pickCharacter(def.id);
      characterIdStore.write(state, def.id);
      applyPassiveEffects(state);
      setGamePhase(state, "playing");
      state.time.play();
      state.scene.entity.floatText({
        instanceId: state.player.userId,
        text: `${def.name.toUpperCase()} — ${def.className.toUpperCase()}`,
        kind: "pickup",
      });
    },
  });

  ctx.game.commands.define<{ nodeId?: string }>("talent.spend", {    apply(state: GameContext, input) {
      const tree = talentTree();
      if (tree === null || input.nodeId === undefined) return;
      const before = 1 + bonus("maxHealth");
      const result = tree.allocate(input.nodeId);
      if (!result.ok) {
        state.game.notices.push({ text: `Can't learn that yet: ${result.reason.replaceAll("-", " ")}.`, tone: "deny" });
        return;
      }
      talentRanksStore.write(state, tree.snapshot().ranks);
      state.scene.entity.stats.set(state.player.userId, "skillPoints", { current: tree.pointsAvailable() });
      applyPassiveEffects(state, before);
    },
  });

  ctx.game.commands.define("talent.respec", {
    apply(state: GameContext) {
      const tree = talentTree();
      if (tree === null || tree.pointsSpent() === 0) return;
      const cost = respecCost(Math.round(state.scene.entity.stats.get(state.player.userId, "level")?.current ?? 1));
      if (!spend(state, "cash", cost, "respec")) {
        state.game.notices.push({ text: `Recalibrating costs ${cost}.`, tone: "deny" });
        return;
      }
      const before = 1 + bonus("maxHealth");
      tree.reset();
      talentRanksStore.write(state, tree.snapshot().ranks);
      state.scene.entity.stats.set(state.player.userId, "skillPoints", { current: tree.pointsAvailable() });
      applyPassiveEffects(state, before);
      state.game.notices.push({ text: `CHASSIS RECALIBRATED — ${tree.pointsAvailable()} points to spend`, tone: "success" });
    },
  });

  // Dev-only capture affordance: open the front's boss wave with the Foreman one shot above its
  // second phase, so a capture can photograph the real phase change and its tell. Never shipped.
  if (import.meta.env.DEV) {
    ctx.game.commands.define<{ mode?: string }>("front.capture", {
      apply(state: GameContext, input) {
        if (input.mode === "fight") stageFrontFight(state);
        else stageFrontBoss(state);
      },
    });
    // Dev-only: stand at the copper ring and take the contract, so a flow can prove the session
    // opens in the real game without a two-minute walk from the crash site.
    ctx.game.commands.define<{ mode?: "ambush" | "upload" }>("relay.capture", {
      apply(state: GameContext, input) {
        stageRelay(state, input.mode ?? "ambush");
      },
    });
    // Dev-only: drop the chassis to its last point of health, so the game's own downed tick opens
    // the Emergency Reserve window for a capture instead of standing in enemy fire for it.
    ctx.game.commands.define("reserve.capture", {
      apply(state: GameContext) {
        const health = state.scene.entity.stats.get(state.player.userId, "health");
        if (health === null) return;
        state.scene.entity.stats.delta(state.player.userId, "health", -Math.max(0, health.current - (health.min ?? 1)));
      },
    });
  }
}

/**
 * Re-derive the module-level `activeCharacter`/`talentTree` singletons from the restored stores after a
 * whole-world `ctx.game.save.load()` — they live outside the world snapshot, unlike the character id,
 * talent ranks and `skillPoints` stat the load already restored. Returns whether a saved build was found.
 */
export function resumeBuild(ctx: GameContext): boolean {
  const characterId = characterIdStore.read(ctx);
  if (characterId === null) return false;
  const def = pickCharacter(characterId);
  const tree = talentTree();
  if (def === null || tree === null) return false;
  const available = ctx.scene.entity.stats.get(ctx.player.userId, "skillPoints")?.current ?? 0;
  tree.hydrate({ points: available, ranks: talentRanksStore.read(ctx) });
  return true;
}

function applyPassiveEffects(ctx: GameContext, previousHealthMult = 1): void {
  const userId = ctx.player.userId;
  const healthMult = 1 + bonus("maxHealth");
  if (healthMult !== previousHealthMult) {
    const health = ctx.scene.entity.stats.get(userId, "health");
    if (health !== null) {
      const max = Math.round((health.max / previousHealthMult) * healthMult);
      ctx.scene.entity.stats.set(userId, "health", { max });
      ctx.scene.entity.stats.delta(userId, "health", Math.max(0, max - health.max));
    }
  }
  ctx.scene.entity.update(userId, {
    movement: { walkSpeed: Math.round(playerDef.walkSpeed * (1 + bonus("moveSpeed")) * 10) / 10 },
  });
}










