import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { resolveShot } from "@jgengine/core/combat/shotOrigin";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { Aim } from "@jgengine/core/scene/spatial";

// The joint: an input action runs the same-named command with the camera's `aim`
// ({ yaw, pitch }); `repeatMs` re-fires it while held, so it is the fire rate.
// resolveShot turns the aim into an eye-height ray, ctx.scene.raycast finds the first
// hitbox, and the hit lands through ctx.scene.entity.effect so shields, death and
// onDeath drops all run. `receive` order "shield" then "health" is shield-over-health.
const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== "raider") return null;
    return {
      role: "enemy",
      stats: { shield: { max: 40 }, health: { max: 60 } },
      receive: { bullet: { order: ["shield", "health"] } },
    };
  },
};

const shooting = defineSystem({
  id: "shooting",
  create(ctx) {
    ctx.game.commands.define<{ aim: Aim }>("fire", {
      apply(state, { aim }) {
        const me = state.player.userId;
        const shot = resolveShot(
          {
            positionOf: (id) => state.scene.entity.get(id)?.position,
            rotationYOf: (id) => state.scene.entity.get(id)?.rotationY,
            collidersOf: (id) => state.scene.entity.collidersOf(id),
          },
          me,
          aim,
        );
        if (shot === null) return;
        const hit = state.scene.raycast({ origin: shot.origin, direction: shot.direction, maxDistance: 80, excludeInstanceIds: [me] });
        if (hit === null || hit.targetKind !== "entity" || !hit.damageEligible) return;
        state.scene.entity.effect({ from: me, to: hit.instanceId, effect: "bullet", via: { amount: 9 } });
      },
    });
  },
});

export const game = defineGame({
  name: "Hitscan",
  content,
  camera: { rig: "first" },
  input: { fire: { hold: ["mouse0"], repeatMs: 120 } },
  systems: [shooting],
});
// Magazine and reload: createMagazine (@jgengine/core/combat/magazine). Player shield regen:
// createRegenShield (@jgengine/core/combat/regenShield). Rolled gun stats: `recipe rolled-gear`.
