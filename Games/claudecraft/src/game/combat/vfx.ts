import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { VfxPresetName } from "@jgengine/core/combat";

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

/**
 * The shared-SDK visual flavor this ability reads as. We route through `@jgengine/core`'s
 * named `vfxPresets` for the archetype (bolt / aura / ground burst) and keep the per-school
 * tint as a color override, so a fire HoT still glows orange rather than the preset green.
 */
export function vfxPreset(ability: AbilityDef): VfxPresetName {
  switch (ability.kind) {
    case "heal":
    case "hot":
    case "buff":
      return "buff";
    case "aoe":
      return "explosion";
    default:
      return ability.school === "physical" ? "slash" : "firebolt";
  }
}

interface SpellVfxAnchors {
  casterId: string;
  targetId?: string;
  at?: readonly [number, number, number];
  radius?: number;
}

export function playSpellVfx(ctx: GameContext, ability: AbilityDef, anchors: SpellVfxAnchors): void {
  const preset = vfxPreset(ability);
  const color = SCHOOL_COLORS[ability.school];
  if (preset === "explosion") {
    if (anchors.at === undefined) return;
    ctx.scene.entity.vfx({ preset, color, from: anchors.at, ...(anchors.radius === undefined ? {} : { radius: anchors.radius }) });
    return;
  }
  if (preset === "buff") {
    ctx.scene.entity.vfx({ preset, color, from: anchors.targetId ?? anchors.casterId });
    return;
  }
  if (anchors.targetId === undefined) return;
  ctx.scene.entity.vfx({ preset, color, from: anchors.casterId, to: anchors.targetId });
}

export function playMeleeVfx(ctx: GameContext, casterId: string, targetId: string): void {
  ctx.scene.entity.vfx({ preset: "slash", from: casterId, to: targetId });
}
