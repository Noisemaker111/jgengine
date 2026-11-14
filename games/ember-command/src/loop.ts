import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { restoreCampaign } from "./game/campaign";
import { loadHeroPicks, pendingHeroOffer } from "./game/heroActs";
import { commandProfile, recordOfSlot, refreshCampaignSlots } from "./game/menuSave";
import { registerMenuCapture } from "./game/captureMenu";
import { matchRunning, session } from "./game/session";
import { setupSkirmish } from "./game/world/scene";

/** @internal Spawn the roster and wire the skirmish once, at world boot. */
export function onInit(ctx: GameContext): void {
  setupSkirmish(ctx);
  registerMenuCapture(ctx);
  void resumeCampaign(ctx);
}

/**
 * Bring the yard campaign back from the session save. A checkpoint holds a whole mid-battle world;
 * the campaign carries its track and its stores across, so the field is restaged fresh and the
 * offered mission is re-offered rather than resumed half-played. If the player already took command
 * before the load landed (a capture boot, a fast click), keep that battle and only adopt the track.
 */
async function resumeCampaign(ctx: GameContext): Promise<void> {
  const save = ctx.game.save;
  if (save === undefined) return;
  if (!(await save.hasSave())) return;
  if (!(await save.load())) return;
  if (!session.started) setupSkirmish(ctx);
  restoreCampaign(ctx);
  // The saved kit is the one piece of hero state the campaign carries into this battle.
  loadHeroPicks(ctx);
  // The field desk reads the commander and the offered mission from the record index.
  const record = recordOfSlot(save.slot());
  commandProfile.name = record?.name ?? "";
  refreshCampaignSlots();
}

/** @internal No avatar — Lawn Order is a commander-view RTS, so a joining player controls the army. */
export function onNewPlayer(_ctx: GameContext): void {}

/** @internal Command-card hotkeys mirror the buttons without conflicting with camera panning. */
export function onTick(ctx: GameContext, _dt: number): void {
  if (!matchRunning()) return;
  if (ctx.input.justPressed("attackMove")) ctx.game.commands.run("unit.attackMove", {});
  if (ctx.input.justPressed("rally")) ctx.game.commands.run("unit.rally", {});
  if (ctx.input.justPressed("hold")) ctx.game.commands.run("unit.hold", {});
  if (ctx.input.justPressed("formationLine")) ctx.game.commands.run("unit.formation", { kind: "line" });
  if (ctx.input.justPressed("formationWedge")) ctx.game.commands.run("unit.formation", { kind: "wedge" });
  if (ctx.input.justPressed("formationColumn")) ctx.game.commands.run("unit.formation", { kind: "column" });
  if (ctx.input.justPressed("selectArmy")) ctx.game.commands.run("unit.selectArmy", {});
  if (ctx.input.justPressed("trainWorker")) ctx.game.commands.run("train.worker", {});
  if (ctx.input.justPressed("trainSoldier")) ctx.game.commands.run("train.soldier", {});
  if (ctx.input.justPressed("trainSpitter")) ctx.game.commands.run("train.spitter", {});
  if (ctx.input.justPressed("trainScout")) ctx.game.commands.run("train.scout", {});
  if (ctx.input.justPressed("trainBeetle")) ctx.game.commands.run("train.beetle", {});
  if (ctx.input.justPressed("layTrail")) ctx.game.commands.run("unit.trail", {});
  if (ctx.input.justPressed("buildBarracks")) ctx.game.commands.run("build.arm", { type: "barracks" });
  if (ctx.input.justPressed("buildGarden")) ctx.game.commands.run("build.arm", { type: "fungus_garden" });
  if (ctx.input.justPressed("buildMound")) ctx.game.commands.run("build.arm", { type: "acid_mound" });
  if (ctx.input.justPressed("buildNursery")) ctx.game.commands.run("build.arm", { type: "nursery" });
  if (ctx.input.justPressed("buildGranary")) ctx.game.commands.run("build.arm", { type: "granary" });
  if (ctx.input.justPressed("researchWeapons")) ctx.game.commands.run("research.weapons", {});
  if (ctx.input.justPressed("researchArmor")) ctx.game.commands.run("research.armor", {});
  if (ctx.input.justPressed("researchAssault")) ctx.game.commands.run("research.assault", {});
  if (ctx.input.justPressed("researchBulwark")) ctx.game.commands.run("research.bulwark", {});
  if (ctx.input.justPressed("heroAbility")) ctx.game.commands.run("hero.act", { act: "thunderclap" });
  if (ctx.input.justPressed("heroMuster")) ctx.game.commands.run("hero.act", { act: "banner" });
  if (ctx.input.justPressed("heroVolley")) ctx.game.commands.run("hero.act", { act: "volley" });
  if (ctx.input.justPressed("heroWard")) ctx.game.commands.run("hero.act", { act: "ward" });
  // The level-up card answers to 7 and 8 while it is open, so a pick never waits on the mouse.
  const offer = pendingHeroOffer(ctx);
  if (offer !== null) {
    if (ctx.input.justPressed("heroPickFirst")) ctx.game.commands.run("hero.pick", { id: offer.options[0].id });
    if (ctx.input.justPressed("heroPickSecond")) ctx.game.commands.run("hero.pick", { id: offer.options[1].id });
  }
}
