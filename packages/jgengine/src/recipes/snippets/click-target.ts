import { defineGame, defineSystem } from "@jgengine/shell/gameKit";

// The joint: `pointer.moveCommand` runs on every left-click with the clicked `entity`
// (or null on open ground), so one command turns clicks into ctx.scene.entity.setTarget.
// Tab cycles hostiles with cycleTarget. The HUD reads the same target:
//   const target = useTarget(userId)   (@jgengine/react)
//   <StatBar entityId={target ?? ""} statId="health" />   (@jgengine/shell/gameKit)
const targeting = defineSystem({
  id: "targeting",
  create(ctx) {
    ctx.game.commands.define<{ entity: string | null }>("select-target", {
      apply(state, { entity }) {
        const me = state.player.userId;
        state.scene.entity.setTarget(me, entity === me ? null : entity);
      },
    });
    ctx.game.commands.define("next-target", {
      apply(state) {
        state.scene.entity.cycleTarget(state.player.userId, { filter: "hostile" });
      },
    });
  },
});

export const game = defineGame({
  name: "Targeting",
  pointer: { moveCommand: "select-target" },
  input: { "next-target": ["Tab"] },
  systems: [targeting],
});
// Abilities read the target: ctx.scene.entity.getTarget(ctx.player.userId), then range-check with
// ctx.scene.entity.distance(me, target) before ctx.scene.entity.effect(...).
