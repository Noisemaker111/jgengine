import type { ProofPlay, ProofSetup } from "@jgengine/core/suite/suiteProof";
import { seededRng } from "@jgengine/core/random/rng";

import { game } from "../../src/game.config";
import { AMMO_STAT_IDS } from "../../src/game/ammo";
import { noteEquipped } from "../../src/game/feel";
import { rollGun } from "../../src/game/handroll";
import type { GunFamily } from "../../src/game/handroll/guns";
import { noteGunHeld } from "../../src/game/progression/discovery";
import { session } from "../../src/game/session";

export type Probe = ReturnType<NonNullable<NonNullable<typeof game.capture>["probe"]>>;

/**
 * A rolled gun of one family in the first hotbar slot, in hand, its ammo pool full: what the game's
 * dev-only `kit.capture` does, which `bun test` does not define.
 */
export function armed(s: ProofSetup<Probe>, family: GunFamily, slot = 0): void {
  const ctx = s.ctx;
  const gun = rollGun(seededRng(`suite-${family}`), 3, { family });
  ctx.player.inventory.put("hotbar", gun.id, 1, { slot });
  session.selectSlot(ctx, slot);
  noteEquipped(gun.id);
  noteGunHeld(ctx, gun);
  const pool = AMMO_STAT_IDS[gun.ammo];
  const ammo = ctx.scene.entity.stats.get(ctx.player.userId, pool);
  if (ammo !== null) ctx.scene.entity.stats.set(ctx.player.userId, pool, { current: ammo.max });
}

/** A husk `metres` due north (+z, heading 0) of the player, where its own AI takes over. */
export function huskAhead(s: ProofSetup<Probe>, metres: number): void {
  const me = s.ctx.scene.entity.get(s.ctx.player.userId);
  if (me === null) throw new Error("no player to stand a husk in front of");
  s.ctx.scene.entity.spawn("husk", { id: "suite_husk", position: [me.position[0], me.position[1], me.position[2] + metres] });
}

/** Pull the trigger with the aim the mouse gives: the camera's heading, and a pitch. */
export async function pull(p: ProofPlay<Probe>, yaw: number, pitch = 0): Promise<void> {
  await p.tryAct("fire", { yaw, pitch, aim: { yaw, pitch } });
  await p.wait(100);
}
