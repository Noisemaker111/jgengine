import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { VfxKind } from "@jgengine/core/game/events";

import type { AbilityDef, AbilitySchool } from "../model";

export const SCHOOL_COLORS: Record<AbilitySchool, number> = {
  physical: 0xd6d0c4,
  fire: 0xff7a2a,
  frost: 0x8ed2ff,
  arcane: 0xd98aff,
  shadow: 0x9a5df0,
  holy: 0xffe9a0,
  nature: 0x86e86a,
};

export function vfxArchetype(ability: AbilityDef): VfxKind {
  switch (ability.kind) {
    case "heal":
    case "hot":
    case "buff":
      return "glow";
    case "aoe":
      return "nova";
    default:
      return ability.school === "physical" ? "spark" : "projectile";
  }
}

interface SpellVfxAnchors {
  casterId: string;
  targetId?: string;
  at?: readonly [number, number, number];
  radius?: number;
}

export function playSpellVfx(ctx: GameContext, ability: AbilityDef, anchors: SpellVfxAnchors): void {
  const kind = vfxArchetype(ability);
  const color = SCHOOL_COLORS[ability.school];
  if (kind === "nova") {
    if (anchors.at === undefined) return;
    ctx.scene.entity.vfx({ kind, color, from: anchors.at, ...(anchors.radius === undefined ? {} : { radius: anchors.radius }) });
    return;
  }
  if (kind === "glow") {
    ctx.scene.entity.vfx({ kind, color, from: anchors.targetId ?? anchors.casterId });
    return;
  }
  if (anchors.targetId === undefined) return;
  ctx.scene.entity.vfx({ kind, color, from: anchors.casterId, to: anchors.targetId });
}

export function playMeleeVfx(ctx: GameContext, casterId: string, targetId: string): void {
  ctx.scene.entity.vfx({ kind: "spark", color: SCHOOL_COLORS.physical, from: casterId, to: targetId });
}
