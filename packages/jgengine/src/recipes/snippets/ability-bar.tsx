import { useMemo } from "react";
import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { ActionBar, actionFromAbilitySlot, useAbilitySlots, useGameContext } from "@jgengine/react";

// The joint: one ability kit is the source of truth for cooldowns. A cooldown group
// every slot joins is the global cooldown. Keys go through `input` actions that run
// same-named commands; the bar only renders the kit and forwards clicks, with its own
// hotkeys off so a key press never casts twice.
const ABILITIES = [
  { id: "ability1", label: "Strike", key: "Digit1", cooldownMs: 0, damage: 12, range: 3 },
  { id: "ability2", label: "Rend", key: "Digit2", cooldownMs: 6000, damage: 20, range: 3 },
  { id: "ability3", label: "Throw", key: "Digit3", cooldownMs: 10000, damage: 15, range: 20 },
] as const;

export const abilities = createAbilityKit(
  ABILITIES.map((a) => ({ id: a.id, cooldownMs: a.cooldownMs, groups: ["gcd"] })),
  { groups: [{ id: "gcd", cooldownMs: 1500 }] },
);

const casting = defineSystem({
  id: "casting",
  tick: { type: "frame" },
  create(ctx) {
    for (const ability of ABILITIES) {
      ctx.game.commands.define(ability.id, {
        apply(state) {
          const me = state.player.userId;
          const target = state.scene.entity.getTarget(me);
          if (target === null) return;
          const distance = state.scene.entity.distance(me, target);
          if (distance === null || distance > ability.range) return;
          if (!abilities.cast(ability.id).ok) return;
          state.scene.entity.effect({ from: me, to: target, effect: "damage", via: { amount: ability.damage } });
        },
      });
    }
  },
  update(_ctx, dt) {
    abilities.tick(dt);
  },
});

function AbilityBar() {
  const ctx = useGameContext();
  const slots = useAbilitySlots(abilities);
  const defs = useMemo(
    () =>
      slots.map((slot) => {
        const ability = ABILITIES.find((a) => a.id === slot.id);
        return actionFromAbilitySlot(slot, { label: ability?.label ?? slot.id, hotkey: ability?.key.replace("Digit", "") });
      }),
    [slots],
  );
  return <ActionBar defs={defs} hotkeys={false} onActivate={(id) => ctx.game.commands.run(id, {})} />;
}

export const game = defineGame({
  name: "Abilities",
  input: Object.fromEntries(ABILITIES.map((a) => [a.id, [a.key]])),
  systems: [casting],
  GameUI: AbilityBar,
});
// Targets come from `recipe click-target`; damage lands through the `receive` map in `recipe combat-loop`.
