import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { CombatVfxEvent } from "@jgengine/core/game/events";

import { game } from "../../game.config";
import { content } from "../content";
import { CLASS_ENTITY_ID, type AbilityDef, type AbilityKind, type AbilitySchool } from "../model";
import { SCHOOL_COLORS, playMeleeVfx, playSpellVfx, vfxArchetype } from "./vfx";

const CASTER = "vfx-caster";
const TARGET = "vfx-target";

function ability(kind: AbilityKind, school: AbilitySchool, extra: Partial<AbilityDef> = {}): AbilityDef {
  return {
    id: "test_ability",
    name: "Test Ability",
    icon: "spell",
    school,
    kind,
    levelReq: 1,
    cost: 0,
    castTime: 0,
    cooldown: 0,
    range: 30,
    base: 10,
    perLevel: 1,
    ...extra,
  };
}

describe("claudecraft spell vfx", () => {
  let ctx: GameContext;
  const events: CombatVfxEvent[] = [];

  beforeAll(() => {
    ctx = createGameContext({
      definition: game.game,
      content,
      player: { userId: CASTER, isNew: true },
    });
    ctx.scene.entity.spawn(CLASS_ENTITY_ID, { id: CASTER, position: [0, 0, 0] });
    ctx.scene.entity.spawn(CLASS_ENTITY_ID, { id: TARGET, position: [6, 0, 0] });
    ctx.game.events.on("combat.vfx", (event) => events.push(event));
  });

  beforeEach(() => {
    events.length = 0;
  });

  test("school color table matches the reference palette", () => {
    expect(SCHOOL_COLORS.fire).toBe(0xff7a2a);
    expect(SCHOOL_COLORS.frost).toBe(0x8ed2ff);
    expect(SCHOOL_COLORS.arcane).toBe(0xd98aff);
    expect(SCHOOL_COLORS.shadow).toBe(0x9a5df0);
    expect(SCHOOL_COLORS.holy).toBe(0xffe9a0);
    expect(SCHOOL_COLORS.nature).toBe(0x86e86a);
  });

  test("archetype maps by ability kind and school", () => {
    expect(vfxArchetype(ability("damage", "frost"))).toBe("projectile");
    expect(vfxArchetype(ability("damage", "physical"))).toBe("spark");
    expect(vfxArchetype(ability("dot", "shadow"))).toBe("projectile");
    expect(vfxArchetype(ability("heal", "holy"))).toBe("glow");
    expect(vfxArchetype(ability("hot", "nature"))).toBe("glow");
    expect(vfxArchetype(ability("buff", "arcane"))).toBe("glow");
    expect(vfxArchetype(ability("aoe", "fire"))).toBe("nova");
  });

  test("a frost bolt emits a projectile from caster to target in school color", () => {
    playSpellVfx(ctx, ability("damage", "frost"), { casterId: CASTER, targetId: TARGET });
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.kind).toBe("projectile");
    expect(event.color).toBe(SCHOOL_COLORS.frost);
    expect(event.from).toEqual([0, 0, 0]);
    expect(event.to).toEqual([6, 0, 0]);
    expect(event.durationMs).toBeGreaterThan(0);
  });

  test("a heal emits a glow anchored on the healed target", () => {
    playSpellVfx(ctx, ability("heal", "holy"), { casterId: CASTER, targetId: TARGET });
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("glow");
    expect(events[0]!.color).toBe(SCHOOL_COLORS.holy);
    expect(events[0]!.from).toEqual([6, 0, 0]);
  });

  test("an aoe emits a nova at the target point with radius", () => {
    playSpellVfx(ctx, ability("aoe", "fire"), { casterId: CASTER, at: [6, 0, 0], radius: 8 });
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("nova");
    expect(events[0]!.radius).toBe(8);
    expect(events[0]!.color).toBe(SCHOOL_COLORS.fire);
  });

  test("a melee swing emits a physical spark on the target", () => {
    playMeleeVfx(ctx, CASTER, TARGET);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("spark");
    expect(events[0]!.color).toBe(SCHOOL_COLORS.physical);
    expect(events[0]!.to).toEqual([6, 0, 0]);
  });
});
