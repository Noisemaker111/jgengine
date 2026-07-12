import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { castSlot } from "../combat/engine";
import { NPCS } from "../entities/npcs/catalog";
import { CLASS_ENTITY_ID } from "../model";
import {
  allocateTalent,
  applySheet,
  barOf,
  chooseSpec,
  classOf,
  clearAuras,
  endSpawnCinematic,
  heroEntityId,
  heroOf,
  selectClass,
  storeKeys,
  teleportHero,
} from "./hero";
import { castFishing, craftRecipe } from "../crafting/systems";
import { advanceDelve, enterDelve, exitDelve } from "../delves/systems";
import type { DelveTier } from "../delves/catalog";
import { dungeonById } from "../dungeons/catalog";
import {
  closeMail,
  codStub,
  marketBuy,
  openMail,
  openMarket,
  sendCopperToSelf,
  sendToSelf,
} from "../mail/systems";
import { leaveFiesta, pickAugment, startFiesta } from "../arena/fiesta";
import { kickValeCup, leaveValeCup, startValeCup } from "../minigames/valeCup";
import { leaveProtectYumi, startProtectYumi } from "../minigames/yumi";
import { dismissPet, revivePet, summonPet } from "../pets/systems";
import { gather } from "../professions/gathering";
import { graveyardOf } from "../world/setup";

type Panel = "bags" | "character" | "quests" | "spellbook" | "talents" | "crafting" | "arena";

function togglePanel(ctx: GameContext, panel: Panel): void {
  const key = storeKeys.panel(ctx.player.userId);
  ctx.game.store.set(key, ctx.game.store.get(key) === panel ? null : panel);
}

export function registerCommands(ctx: GameContext): void {
  const { commands } = ctx.game;
  commands.define<{ classId: string; name?: string }>("class.select", {
    validate: (state, input) =>
      state.game.store.get(storeKeys.class(state.player.userId)) === undefined && input?.classId !== undefined
        ? null
        : { reason: "class-already-chosen" },
    apply(state, input) {
      selectClass(state, state.player.userId, input.classId, input.name);
    },
  });
  commands.define("cinematic.skip", {
    apply(state) {
      endSpawnCinematic(state, state.player.userId);
    },
  });
  for (let slot = 0; slot < 9; slot += 1) {
    commands.define(`castSlot${slot + 1}`, {
      apply(state) {
        castSlot(state, state.player.userId, slot);
      },
    });
  }
  commands.define("attack", {
    apply(state) {
      const hero = heroOf(state.player.userId);
      if (hero === null) return;
      hero.autoAttack = !hero.autoAttack;
      state.game.store.set(storeKeys.autoAttack(state.player.userId), hero.autoAttack);
    },
  });
  commands.define("openBags", { apply: (state) => togglePanel(state, "bags") });
  commands.define("openCharacter", { apply: (state) => togglePanel(state, "character") });
  commands.define("openQuestLog", { apply: (state) => togglePanel(state, "quests") });
  commands.define("openSpellbook", { apply: (state) => togglePanel(state, "spellbook") });
  commands.define<{ abilityId: string; slot: number }>("spellbook.assign", {
    apply(state, input) {
      const userId = state.player.userId;
      const cls = classOf(state, userId);
      if (cls === null || !cls.abilities.some((ability) => ability.id === input.abilityId)) return;
      if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot > 8) return;
      const bar = [...barOf(state, userId)];
      while (bar.length < 9) bar.push("");
      const existing = bar.indexOf(input.abilityId);
      if (existing >= 0) bar[existing] = bar[input.slot];
      bar[input.slot] = input.abilityId;
      state.game.store.set(storeKeys.bar(userId), bar);
    },
  });
  commands.define<{ npcId: string }>("dialogue.open", {
    apply(state, input) {
      if (NPCS.some((npc) => npc.id === input.npcId)) {
        state.game.store.set(storeKeys.dialogue(state.player.userId), input.npcId);
      }
    },
  });
  commands.define("dialogue.close", {
    apply(state) {
      state.game.store.delete(storeKeys.dialogue(state.player.userId));
    },
  });
  commands.define<{ questId: string }>("quest.accept", {
    apply(state, input) {
      const rejection = state.game.quest.accept(state.player.userId, input.questId);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ questId: string }>("quest.turnIn", {
    apply(state, input) {
      const rejection = state.game.quest.turnIn(state.player.userId, input.questId);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ shopId: string }>("shop.open", {
    apply(state, input) {
      state.game.store.set(storeKeys.shop(state.player.userId), input.shopId);
      state.game.store.delete(storeKeys.dialogue(state.player.userId));
    },
  });
  commands.define("shop.close", {
    apply(state) {
      state.game.store.delete(storeKeys.shop(state.player.userId));
    },
  });
  commands.define<{ itemId: string }>("shop.buy", {
    apply(state, input) {
      const shopId = state.game.store.get(storeKeys.shop(state.player.userId));
      if (typeof shopId !== "string") return;
      const rejection = state.game.trade.buy(input.itemId, 1, { shop: shopId, inventoryId: "bags" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ itemId: string }>("shop.sell", {
    apply(state, input) {
      const shopId = state.game.store.get(storeKeys.shop(state.player.userId));
      if (typeof shopId !== "string") return;
      const rejection = state.game.trade.sell(input.itemId, 1, { shop: shopId, inventoryId: "bags" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ itemId: string }>("bags.use", {
    apply(state, input) {
      const result = state.item.use.use({
        from: state.player.userId,
        itemId: input.itemId,
        inventoryId: "bags",
      });
      if (result.error !== undefined) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: result.error, kind: "info" });
      }
    },
  });
  commands.define<{ instanceId: string }>("gather", {
    apply(state, input) {
      gather(state, state.player.userId, input.instanceId);
    },
  });
  commands.define("bank.open", {
    apply(state) {
      state.game.store.set(storeKeys.bank(state.player.userId), true);
    },
  });
  commands.define("bank.close", {
    apply(state) {
      state.game.store.delete(storeKeys.bank(state.player.userId));
    },
  });
  commands.define<{ itemId: string }>("bank.deposit", {
    apply(state, input) {
      if (state.game.store.get(storeKeys.bank(state.player.userId)) !== true) return;
      if (state.player.inventory.take("bags", input.itemId, 1).status !== "ok") return;
      const result = state.player.inventory.put("bank", input.itemId, 1);
      if (result.status !== "ok") state.player.inventory.put("bags", input.itemId, 1);
    },
  });
  commands.define<{ itemId: string }>("bank.withdraw", {
    apply(state, input) {
      if (state.game.store.get(storeKeys.bank(state.player.userId)) !== true) return;
      if (state.player.inventory.take("bank", input.itemId, 1).status !== "ok") return;
      const result = state.player.inventory.put("bags", input.itemId, 1);
      if (result.status !== "ok") state.player.inventory.put("bank", input.itemId, 1);
    },
  });
  commands.define<{ specId: string }>("talent.choose", {
    apply(state, input) {
      chooseSpec(state, state.player.userId, input.specId);
    },
  });
  commands.define<{ nodeId: string }>("talent.allocate", {
    apply(state, input) {
      allocateTalent(state, state.player.userId, input.nodeId);
    },
  });
  commands.define("openTalents", { apply: (state) => togglePanel(state, "talents") });
  commands.define("craft.open", { apply: (state) => togglePanel(state, "crafting" as Panel) });
  commands.define<{ recipeId: string }>("craft.make", {
    apply(state, input) {
      craftRecipe(state, state.player.userId, input.recipeId);
    },
  });
  commands.define("fishing.cast", {
    apply(state) {
      castFishing(state, state.player.userId);
    },
  });
  commands.define<{ dungeonId: string }>("dungeon.enter", {
    apply(state, input) {
      const dungeon = dungeonById(input.dungeonId);
      if (dungeon === null) return;
      const userId = state.player.userId;
      const level = state.scene.entity.stats.get(userId, "level")?.current ?? 1;
      if (level < dungeon.levelRange[0] - 2) {
        state.scene.entity.floatText({
          instanceId: userId,
          text: `${dungeon.name} calls for level ${dungeon.levelRange[0]}+`,
          kind: "info",
        });
      }
      teleportHero(state, userId, dungeon.inside[0], dungeon.inside[1]);
    },
  });
  commands.define<{ dungeonId: string }>("dungeon.exit", {
    apply(state, input) {
      const dungeon = dungeonById(input.dungeonId);
      if (dungeon === null) return;
      teleportHero(state, state.player.userId, dungeon.entrance[0], dungeon.entrance[1]);
    },
  });
  commands.define("player.release", {
    apply(state) {
      const userId = state.player.userId;
      if (state.game.store.get(storeKeys.dead(userId)) !== true) return;
      const snapshot = state.game.store.get(`deathstats:${userId}`) as
        | { level: number; xp: number; xpMax: number }
        | undefined;
      const corpse = state.game.store.get(`corpse:${userId}`) as readonly [number, number] | undefined;
      const [gx, gz] = graveyardOf(corpse?.[0] ?? 0, corpse?.[1] ?? 0);
      state.scene.entity.spawn(heroEntityId(state, userId), {
        id: userId,
        position: [gx, state.world.groundHeightAt(gx, gz), gz],
      });
      if (snapshot !== undefined) {
        state.scene.entity.stats.set(userId, "level", { current: snapshot.level });
        state.scene.entity.stats.set(userId, "xp", { current: snapshot.xp, max: snapshot.xpMax });
      }
      clearAuras(state, userId);
      state.game.store.set(storeKeys.dead(userId), false);
      const hero = heroOf(userId);
      if (hero !== null) {
        hero.casting = null;
        hero.autoAttack = false;
        hero.combatUntil = 0;
      }
      state.game.store.delete(storeKeys.cast(userId));
      applySheet(state, userId, { fill: true });
    },
  });
  commands.define<{ delveId: string; tier?: DelveTier }>("delve.enter", {
    apply(state, input) {
      enterDelve(state, state.player.userId, input.delveId, input.tier ?? "normal");
    },
  });
  commands.define("delve.advance", {
    apply(state) {
      advanceDelve(state, state.player.userId);
    },
  });
  commands.define("delve.exit", {
    apply(state) {
      exitDelve(state, state.player.userId);
    },
  });
  commands.define("mail.open", {
    apply(state) {
      openMail(state, state.player.userId);
    },
  });
  commands.define("mail.close", {
    apply(state) {
      closeMail(state, state.player.userId);
    },
  });
  commands.define<{ itemId: string; count?: number }>("mail.sendSelf", {
    apply(state, input) {
      const reason = sendToSelf(state, state.player.userId, input.itemId, input.count ?? 1);
      if (reason !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
      }
    },
  });
  commands.define<{ amount: number }>("mail.sendCopper", {
    apply(state, input) {
      const reason = sendCopperToSelf(state, state.player.userId, input.amount);
      if (reason !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
      }
    },
  });
  commands.define("mail.cod", {
    apply(state) {
      codStub(state, state.player.userId);
    },
  });
  commands.define("market.open", {
    apply(state) {
      openMarket(state, state.player.userId);
    },
  });
  commands.define<{ itemId: string }>("market.buy", {
    apply(state, input) {
      const reason = marketBuy(state, state.player.userId, input.itemId);
      if (reason !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
      }
    },
  });
  commands.define<{ wager?: number }>("valecup.start", {
    apply(state, input) {
      startValeCup(state, state.player.userId, input.wager ?? 0);
    },
  });
  commands.define<{ dirX?: number; dirZ?: number }>("valecup.kick", {
    apply(state, input) {
      kickValeCup(state, state.player.userId, input.dirX ?? 0, input.dirZ ?? -1);
    },
  });
  commands.define("valecup.leave", {
    apply(state) {
      leaveValeCup(state, state.player.userId);
    },
  });
  commands.define("openArena", { apply: (state) => togglePanel(state, "arena") });
  commands.define("fiesta.start", {
    apply(state) {
      startFiesta(state, state.player.userId);
    },
  });
  commands.define<{ augmentId: string }>("fiesta.pick", {
    apply(state, input) {
      pickAugment(state, state.player.userId, input.augmentId);
    },
  });
  commands.define("fiesta.leave", {
    apply(state) {
      leaveFiesta(state, state.player.userId);
    },
  });
  commands.define("yumi.start", {
    apply(state) {
      startProtectYumi(state, state.player.userId);
    },
  });
  commands.define("yumi.leave", {
    apply(state) {
      leaveProtectYumi(state, state.player.userId);
    },
  });
  commands.define<{ petId?: string }>("pet.summon", {
    apply(state, input) {
      summonPet(state, state.player.userId, input.petId);
    },
  });
  commands.define("pet.dismiss", {
    apply(state) {
      dismissPet(state, state.player.userId);
    },
  });
  commands.define("pet.revive", {
    apply(state) {
      revivePet(state, state.player.userId);
    },
  });
}
