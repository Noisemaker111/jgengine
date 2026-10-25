import type { PointerHit } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { tool } from "./hooks";
import { idea } from "./idea";
import { cellFor, realmGrid } from "./places";
import { realm } from "./spec";
import { foundSeat } from "./town";

type PointerInput = Pick<PointerHit, "point" | "entity">;

const grid = realmGrid(editorLayers);
const deny = (ctx: GameContext, text: string): void => {
  ctx.game.notices.push({ text, tone: "deny" });
};

/** Pick up a building to place (its number key or its button); the same key puts it down again. */
export function arm(ctx: GameContext, id: string | null): void {
  tool.update(ctx, (state) => ({ ...state, armed: state.armed === id ? null : id, selected: null }));
}

/** Put the building in hand down where the pointer is, centred on the point. */
function placeAt(ctx: GameContext, id: string, point: readonly number[]): void {
  const building = idea.buildings.find((entry) => entry.id === id)!;
  const cell = cellFor(grid, point[0]!, point[2]!, building.size);
  if (cell === null) return deny(ctx, `Build inside the ${idea.seat.label.toLowerCase()}'s grounds`);
  const world = realm.of(ctx);
  const refused = world.canPlace(id, { cell });
  if (refused !== null) return deny(ctx, refused.message);
  world.place(id, { cell });
  ctx.game.notices.push({ text: `${building.label} going up`, tone: "info" });
}

/** Left click: place what is in hand, else look at the building under the pointer. */
function click(ctx: GameContext, input: PointerInput): void {
  const held = tool.read(ctx);
  if (held.armed !== null) {
    if (Array.isArray(input.point) && input.point.length === 3) placeAt(ctx, held.armed, input.point);
    return;
  }
  const picked = input.entity !== null && realm.of(ctx).instance(input.entity) !== null ? input.entity : null;
  tool.update(ctx, (state) => ({ ...state, selected: picked }));
}

function actOnSelected(ctx: GameContext, action: (kind: string) => string): void {
  const selected = tool.read(ctx).selected;
  const instance = selected === null ? null : realm.of(ctx).instance(selected);
  if (instance === null) return deny(ctx, "Click a building first");
  const done = realm.of(ctx).act(action(instance.kind), instance.id);
  if (!done.ok) deny(ctx, done.message);
}

/** The pointer and every build key: place, select, upgrade, demolish, put down. */
export const buildSystem = defineSystem({
  id: "realm.build",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define<PointerInput>("realm.click", {
      apply(state, input) {
        click(state, input);
        return state;
      },
    });
    ctx.game.commands.define("realm.cancel", {
      apply(state) {
        tool.update(state, (held) => ({ ...held, armed: null, selected: null }));
        return state;
      },
    });
    idea.buildings.forEach((building, index) => {
      ctx.game.commands.define(`build${index + 1}`, {
        apply(state) {
          arm(state, building.id);
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
    ctx.game.commands.define("demolish", {
      apply(state) {
        actOnSelected(state, () => "demolish");
        return state;
      },
    });
    // A town a few minutes in, from the scene's `plan` markers: what a capture state or a clip starts from.
    ctx.game.commands.define("stage", {
      apply(state) {
        foundSeat(state);
        const world = realm.of(state);
        for (const plan of editorLayers.markers.filter((marker) => marker.kind === "plan")) {
          const id = String(plan.meta?.["building"] ?? "");
          const building = idea.buildings.find((entry) => entry.id === id);
          const cell = building === undefined ? null : cellFor(grid, plan.position.x, plan.position.z, building.size);
          if (cell !== null && world.canPlace(id, { cell }, { free: true }) === null) world.place(id, { cell }, { free: true });
        }
        return state;
      },
    });
    ctx.game.commands.define("dismiss", {
      apply(state) {
        tool.update(state, (held) => ({ ...held, dismissed: true }));
        return state;
      },
    });
  },
});
