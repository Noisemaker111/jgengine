import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** Who is asking and from where: what the probe pieces measure against. */
export function probeFrame(ctx: GameContext) {
  const me = ctx.scene.entity.get(ctx.player.userId);
  const here: [number, number, number] = me === null ? [0, 0, 0] : [me.position[0], me.position[1], me.position[2]];
  const sight = <K extends string>(what: K, at: readonly [number, number, number] | null) =>
    // type-escape: computed template-literal keys widen to string; the two keys are exactly these.
    ({
      [`${what}Yaw`]: at === null ? 0 : Math.round(Math.atan2(at[0] - here[0], at[2] - here[2]) * 100) / 100,
      [`${what}Dist`]: at === null || me === null ? -1 : Math.round(Math.hypot(at[0] - here[0], at[2] - here[2]) * 10) / 10,
    }) as Record<`${K}Yaw` | `${K}Dist`, number>;
  return { me, here, sight };
}

export type ProbeFrame = ReturnType<typeof probeFrame>;
