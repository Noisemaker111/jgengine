/**
 * Scrap Signal — prove Noisemaker111/JGengine-games#123 headlessly.
 *
 * The world's own rustflat crew is already spawned when the run bootstraps. The script picks the
 * nearest live Bruiser Frame, stands the player six metres from it facing −z, and holds fire. In
 * four seconds of game time the enemy must take damage through the shared damage model and close on
 * the player through the zone AI — the two questions nothing could answer without playing.
 *
 *   bun run simulate scrap-signal scripts/scrap-hit.play.ts
 *
 * The starter pistol rolls the explosive element, which carries `weapon.explosion`; the engine's
 * projectile classifier reads any explosion as a lobbed round and settles it at a ballistic landing
 * point ~40 m away, so a hitscan shot from that gun hits nothing (see the lane report). The script
 * equips a deterministic non-explosive gun so the proof measures the enemy, not that bug.
 */

import { seededRng } from "@jgengine/core/random/rng";
import { rollGun } from "../src/game/handroll";

const SHOT_TARGETS = ["bruiser", "crawler", "crawler_soldier", "ripper", "scrapper"];
const STANDOFF = 6;

let enemyId = "";
let enemyHealth = 0;
let startDistance = 0;

export default {
  seed: "scrap-hit",
  dt: 1 / 60,
  ticks: 240,
  setup(ctx) {
    ctx.game.commands.run("character.pick", { characterId: "gunk" });
    ctx.time.play();
    const playerId = ctx.player.userId;
    const player = ctx.scene.entity.get(playerId);
    if (player === null) throw new Error("scrap-hit: the player did not spawn");

    const slot = ctx.player.inventory.state("hotbar").slots[0];
    if (slot !== null) ctx.player.inventory.take("hotbar", slot.itemId, slot.count);
    const rng = seededRng("scrap-hit-gun");
    let gun = rollGun(rng, 1, { family: "rifle", rarity: "common" });
    for (let roll = 0; roll < 32 && (gun.weapon.explosion !== undefined || gun.weapon.projectile !== undefined); roll += 1) {
      gun = rollGun(rng, 1, { family: "rifle", rarity: "common" });
    }
    ctx.player.inventory.put("hotbar", gun.id, 1, { slot: 0 });

    const enemies = ctx.scene.entity
      .list()
      .filter((entity) => entity.id !== playerId && SHOT_TARGETS.includes(entity.name))
      .map((entity) => ({ entity, distance: ctx.scene.entity.distance(entity.id, playerId) }))
      .sort((left, right) => left.distance - right.distance);
    const target = enemies[0];
    if (target === undefined) throw new Error("scrap-hit: the rustflat crew never spawned");

    enemyId = target.entity.id;
    enemyHealth = ctx.scene.entity.stats.get(enemyId, "health")?.current ?? 0;
    // Stand due +z of the enemy so the aim is a constant π (the engine's yaw is atan2(dx, dz)).
    const [ex, , ez] = target.entity.position;
    ctx.scene.entity.update(playerId, { position: [ex, ctx.world.groundHeightAt(ex, ez + STANDOFF), ez + STANDOFF] });
    startDistance = ctx.scene.entity.distance(enemyId, playerId);
  },
  steps: [
    { tick: 1, action: "aim", yaw: Math.PI, pitch: 0, label: "face the Bruiser" },
    { tick: 2, action: "fire", ticks: 16, label: "hold fire" },
  ],
  expect: [
    {
      id: "enemy-took-damage",
      subject: "enemy health",
      read: (ctx) => ctx.scene.entity.stats.get(enemyId, "health")?.current ?? null,
      test: (now) => typeof now === "number" && now < enemyHealth,
    },
    {
      id: "enemy-closed-in",
      subject: "enemy distance to player",
      at: 180,
      read: (ctx) => (enemyId === "" ? null : ctx.scene.entity.distance(enemyId, ctx.player.userId)),
      test: (now) => typeof now === "number" && now < startDistance - 1,
    },
    {
      id: "player-alive",
      subject: "player health",
      read: (ctx) => ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? null,
      test: (now) => typeof now === "number" && now > 0,
    },
  ],
};
