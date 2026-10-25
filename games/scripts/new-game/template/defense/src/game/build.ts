import type { PointerHit } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { tool } from "./hooks";
import { idea } from "./idea";
import { padNear, pads } from "./places";
import { sendWave } from "./siege";
import { fact, hold } from "./spec";

type PointerInput = Pick<PointerHit, "point" | "entity">;

const PADS = pads(editorLayers);
/** Metres from a click to the pad it means. */
const REACH = 9;

const deny = (ctx: GameContext, text: string): void => {
  ctx.game.notices.push({ text, tone: "deny" });
};

/** Pick up a tower to build (its number key or its button); the same key puts it down again. */
export function arm(ctx: GameContext, id: string | null): void {
  tool.update(ctx, (state) => ({ ...state, armed: state.armed === id ? null : id, selected: null }));
}

/** Left click: build what is in hand on the free pad nearest the click, else look at the tower there. */
function click(ctx: GameContext, input: PointerInput): void {
  const world = hold.of(ctx);
  const held = tool.read(ctx);
  const point = Array.isArray(input.point) && input.point.length === 3 ? input.point : null;
  if (held.armed !== null) {
    if (point === null) return;
    const pad = padNear(PADS, point[0]!, point[2]!, REACH, (candidate) => world.occupant(candidate.id) === null);
    if (pad === null) return deny(ctx, "Build on an empty pad beside the lane");
    const refused = world.canPlace(held.armed, { slot: pad.id });
    if (refused !== null) return deny(ctx, refused.message);
    world.place(held.armed, { slot: pad.id });
    const tower = idea.towers.find((entry) => entry.id === held.armed);
    ctx.game.notices.push({ text: `${tower?.label ?? "Tower"} going up`, tone: "info" });
    return;
  }
  let picked = input.entity !== null && world.instance(input.entity) !== null ? input.entity : null;
  if (picked === null && point !== null) {
    const pad = padNear(PADS, point[0]!, point[2]!, 4, (candidate) => world.occupant(candidate.id) !== null);
    picked = pad === null ? null : world.occupant(pad.id);
  }
  tool.update(ctx, (state) => ({ ...state, selected: picked }));
}

function actOnSelected(ctx: GameContext, action: (kind: string) => string): void {
  const selected = tool.read(ctx).selected;
  const instance = selected === null ? null : hold.of(ctx).instance(selected);
  if (instance === null) return deny(ctx, "Click a tower first");
  const done = hold.of(ctx).act(action(instance.kind), instance.id);
  if (!done.ok) deny(ctx, done.message);
  else if (action(instance.kind) === "sell") tool.update(ctx, (state) => ({ ...state, selected: null }));
}

/** The pointer and every key: build, look, upgrade, sell, send the next wave. */
export const buildSystem = defineSystem({
  id: "hold.build",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define<PointerInput>("hold.click", {
      apply(state, input) {
        click(state, input);
        return state;
      },
    });
    ctx.game.commands.define("hold.cancel", {
      apply(state) {
        tool.update(state, () => ({ armed: null, selected: null }));
        return state;
      },
    });
    idea.towers.forEach((tower, index) => {
      ctx.game.commands.define(`build${index + 1}`, {
        apply(state) {
          arm(state, tower.id);
          return state;
        },
      });
    });
    ctx.game.commands.define("upgrade", {
      apply(state) {
        actOnSelected(state, (kind) => `upgrade_${kind}`);
        return state;
      },
    });
    ctx.game.commands.define("sell", {
      apply(state) {
        actOnSelected(state, () => "sell");
        return state;
      },
    });
    ctx.game.commands.define("callWave", {
      apply(state) {
        if (!sendWave(state, true)) deny(state, `The ${idea.wave.toLowerCase()} is already on its way`);
        return state;
      },
    });
    // A field a few waves in, from the pads nearest the core: what a capture state or a clip starts from.
    ctx.game.commands.define("stage", {
      apply(state) {
        const world = hold.of(state);
        const open = idea.towers.filter((tower) => tower.from <= 2);
        world.change({ [fact("wave")]: 2, [fact("cleared")]: 2, [fact("coin")]: 120 });
        PADS.slice(0, 6).forEach((pad, index) => {
          const tower = open[index % open.length]!;
          if (world.occupant(pad.id) === null) world.place(tower.id, { slot: pad.id }, { free: true });
        });
        sendWave(state, false);
        return state;
      },
    });
  },
});
