import { buyAuctionListing, cancelAuctionListing, closeAuction, collectAuction, listAuction, openAuction, searchAuction, } from "../auction/systems";
import { castSlot } from "../combat/engine";
import { NPCS } from "../entities/npcs/catalog";
import { CLASS_ENTITY_ID } from "../model";
import { allocateTalent, applySheet, barOf, chooseSpec, classOf, clearAuras, endSpawnCinematic, heroEntityId, heroOf, selectClass, teleportHero, } from "./hero";
import { autoAttackStore, bankStore, barStore, castStore, classStore, corpseStore, deadStore, deathStatsStore, dialogueStore, panelStore, shopStore, } from "./stores";
import { castFishing, craftRecipe } from "../crafting/systems";
import { advanceDelve, enterDelve, exitDelve } from "../delves/systems";
import { dungeonById } from "../dungeons/catalog";
import { closeMail, codStub, marketBuy, openMail, openMarket, sendCopperToSelf, sendToSelf, } from "../mail/systems";
import { leaveFiesta, pickAugment, startFiesta } from "../arena/fiesta";
import { closeLockpick, engageLockpick, pickLock } from "../minigames/lockpick";
import { kickValeCup, leaveValeCup, startValeCup } from "../minigames/valeCup";
import { leaveProtectYumi, startProtectYumi } from "../minigames/yumi";
import { dismissPet, revivePet, summonPet } from "../pets/systems";
import { applyEnchant, disenchantItem } from "../professions/enchanting";
import { gather } from "../professions/gathering";
import { salvageItem } from "../professions/salvage";
import { graveyardOf } from "../world/setup";
function togglePanel(ctx, panel) {
    const userId = ctx.player.userId;
    panelStore.write(ctx, userId, panelStore.read(ctx, userId) === panel ? null : panel);
}
export function registerCommands(ctx) {
    const { commands } = ctx.game;
    commands.define("class.select", {
        validate: (state, input) => classStore.peek(state, state.player.userId) === undefined && input?.classId !== undefined
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
            const hero = heroOf(state, state.player.userId);
            if (hero === null)
                return;
            hero.autoAttack = !hero.autoAttack;
            autoAttackStore.write(state, state.player.userId, hero.autoAttack);
        },
    });
    commands.define("openBags", { apply: (state) => togglePanel(state, "bags") });
    commands.define("openCharacter", { apply: (state) => togglePanel(state, "character") });
    commands.define("openQuestLog", { apply: (state) => togglePanel(state, "quests") });
    commands.define("openSpellbook", { apply: (state) => togglePanel(state, "spellbook") });
    commands.define("spellbook.assign", {
        apply(state, input) {
            const userId = state.player.userId;
            const cls = classOf(state, userId);
            if (cls === null || !cls.abilities.some((ability) => ability.id === input.abilityId))
                return;
            if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot > 8)
                return;
            const bar = [...barOf(state, userId)];
            while (bar.length < 9)
                bar.push("");
            const existing = bar.indexOf(input.abilityId);
            if (existing >= 0)
                bar[existing] = bar[input.slot];
            bar[input.slot] = input.abilityId;
            barStore.write(state, userId, bar);
        },
    });
    commands.define("dialogue.open", {
        apply(state, input) {
            if (NPCS.some((npc) => npc.id === input.npcId)) {
                dialogueStore.write(state, state.player.userId, input.npcId);
            }
        },
    });
    commands.define("dialogue.close", {
        apply(state) {
            dialogueStore.clear(state, state.player.userId);
        },
    });
    commands.define("quest.accept", {
        apply(state, input) {
            const rejection = state.game.quest.accept(state.player.userId, input.questId);
            if (rejection !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
            }
        },
    });
    commands.define("quest.turnIn", {
        apply(state, input) {
            const rejection = state.game.quest.turnIn(state.player.userId, input.questId);
            if (rejection !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
            }
        },
    });
    commands.define("shop.open", {
        apply(state, input) {
            shopStore.write(state, state.player.userId, input.shopId);
            dialogueStore.clear(state, state.player.userId);
        },
    });
    commands.define("shop.close", {
        apply(state) {
            shopStore.clear(state, state.player.userId);
        },
    });
    commands.define("shop.buy", {
        apply(state, input) {
            const shopId = shopStore.read(state, state.player.userId);
            if (shopId === null)
                return;
            const rejection = state.game.trade.buy(input.itemId, 1, { shop: shopId, inventoryId: "bags" });
            if (rejection !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
            }
        },
    });
    commands.define("shop.sell", {
        apply(state, input) {
            const shopId = shopStore.read(state, state.player.userId);
            if (shopId === null)
                return;
            const rejection = state.game.trade.sell(input.itemId, 1, { shop: shopId, inventoryId: "bags" });
            if (rejection !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
            }
        },
    });
    commands.define("bags.use", {
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
    commands.define("gather", {
        apply(state, input) {
            gather(state, state.player.userId, input.instanceId);
        },
    });
    commands.define("bank.open", {
        apply(state) {
            bankStore.write(state, state.player.userId, true);
        },
    });
    commands.define("bank.close", {
        apply(state) {
            bankStore.clear(state, state.player.userId);
        },
    });
    commands.define("bank.deposit", {
        apply(state, input) {
            if (!bankStore.read(state, state.player.userId))
                return;
            if (state.player.inventory.take("bags", input.itemId, 1).status !== "ok")
                return;
            const result = state.player.inventory.put("bank", input.itemId, 1);
            if (result.status !== "ok")
                state.player.inventory.put("bags", input.itemId, 1);
        },
    });
    commands.define("bank.withdraw", {
        apply(state, input) {
            if (!bankStore.read(state, state.player.userId))
                return;
            if (state.player.inventory.take("bank", input.itemId, 1).status !== "ok")
                return;
            const result = state.player.inventory.put("bags", input.itemId, 1);
            if (result.status !== "ok")
                state.player.inventory.put("bank", input.itemId, 1);
        },
    });
    commands.define("talent.choose", {
        apply(state, input) {
            chooseSpec(state, state.player.userId, input.specId);
        },
    });
    commands.define("talent.allocate", {
        apply(state, input) {
            allocateTalent(state, state.player.userId, input.nodeId);
        },
    });
    commands.define("openTalents", { apply: (state) => togglePanel(state, "talents") });
    commands.define("craft.open", { apply: (state) => togglePanel(state, "crafting") });
    commands.define("craft.make", {
        apply(state, input) {
            craftRecipe(state, state.player.userId, input.recipeId);
        },
    });
    commands.define("fishing.cast", {
        apply(state) {
            castFishing(state, state.player.userId);
        },
    });
    commands.define("dungeon.enter", {
        apply(state, input) {
            const dungeon = dungeonById(input.dungeonId);
            if (dungeon === null)
                return;
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
    commands.define("dungeon.exit", {
        apply(state, input) {
            const dungeon = dungeonById(input.dungeonId);
            if (dungeon === null)
                return;
            teleportHero(state, state.player.userId, dungeon.entrance[0], dungeon.entrance[1]);
        },
    });
    commands.define("player.release", {
        apply(state) {
            const userId = state.player.userId;
            if (!deadStore.read(state, userId))
                return;
            const snapshot = deathStatsStore.read(state, userId);
            const corpse = corpseStore.read(state, userId);
            const [gx, gz] = graveyardOf(corpse?.[0] ?? 0, corpse?.[1] ?? 0);
            state.scene.entity.spawn(heroEntityId(state, userId), {
                id: userId,
                position: [gx, state.world.groundHeightAt(gx, gz), gz],
            });
            if (snapshot !== null) {
                state.scene.entity.stats.set(userId, "level", { current: snapshot.level });
                state.scene.entity.stats.set(userId, "xp", { current: snapshot.xp, max: snapshot.xpMax });
            }
            clearAuras(state, userId);
            deadStore.write(state, userId, false);
            const hero = heroOf(state, userId);
            if (hero !== null) {
                hero.casting = null;
                hero.autoAttack = false;
                hero.combatUntil = 0;
            }
            castStore.clear(state, userId);
            applySheet(state, userId, { fill: true });
        },
    });
    commands.define("delve.enter", {
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
    commands.define("mail.sendSelf", {
        apply(state, input) {
            const reason = sendToSelf(state, state.player.userId, input.itemId, input.count ?? 1);
            if (reason !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
            }
        },
    });
    commands.define("mail.sendCopper", {
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
    commands.define("market.buy", {
        apply(state, input) {
            const reason = marketBuy(state, state.player.userId, input.itemId);
            if (reason !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
            }
        },
    });
    commands.define("auction.open", {
        apply(state) {
            openAuction(state, state.player.userId);
        },
    });
    commands.define("auction.close", {
        apply(state) {
            closeAuction(state, state.player.userId);
        },
    });
    commands.define("auction.search", {
        apply(state, input) {
            searchAuction(state, state.player.userId, input.query);
        },
    });
    commands.define("auction.list", {
        apply(state, input) {
            const reason = listAuction(state, state.player.userId, input.itemId, input.count, input.price);
            if (reason !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
            }
        },
    });
    commands.define("auction.cancel", {
        apply(state, input) {
            const reason = cancelAuctionListing(state, state.player.userId, input.listingId);
            if (reason !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
            }
        },
    });
    commands.define("auction.buy", {
        apply(state, input) {
            const reason = buyAuctionListing(state, state.player.userId, input.listingId);
            if (reason !== null) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: reason, kind: "info" });
            }
        },
    });
    commands.define("auction.collect", {
        apply(state) {
            collectAuction(state, state.player.userId);
        },
    });
    commands.define("valecup.start", {
        apply(state, input) {
            startValeCup(state, state.player.userId, input.wager ?? 0);
        },
    });
    commands.define("valecup.kick", {
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
    commands.define("fiesta.pick", {
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
    commands.define("pet.summon", {
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
    commands.define("item.salvage", {
        apply(state, input) {
            const result = salvageItem(state, state.player.userId, input.itemId);
            if (!result.ok) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: "Cannot salvage that", kind: "info" });
            }
        },
    });
    commands.define("item.disenchant", {
        apply(state, input) {
            const result = disenchantItem(state, state.player.userId, input.itemId);
            if (!result.ok) {
                state.scene.entity.floatText({ instanceId: state.player.userId, text: "Cannot disenchant that", kind: "info" });
            }
        },
    });
    commands.define("item.applyEnchant", {
        apply(state, input) {
            applyEnchant(state, state.player.userId, input.slot, input.enchantId);
        },
    });
    commands.define("lockpick.engage", {
        apply(state, input) {
            engageLockpick(state, state.player.userId, input.instanceId, input.ante ?? 2);
        },
    });
    commands.define("lockpick.pick", {
        apply(state, input) {
            pickLock(state, state.player.userId, input.action);
        },
    });
    commands.define("lockpick.close", {
        apply(state) {
            closeLockpick(state, state.player.userId);
        },
    });
}
