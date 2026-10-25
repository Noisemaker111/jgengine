import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PointerHit } from "@jgengine/core/input/pointer";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { BUILDABLES } from "../objects/catalog";
import { session } from "../session";
import { placementAt } from "./placement";
import { archiveSave, savePark } from "../persistence";
import { tracePark } from "../evidence";
import { syncAmbience } from "../audio";
import { openParkDay } from "../daySession";
import { coasterCircuit } from "../rides";
import { park, placeFree } from "../park";
import { refundOf } from "../parkScene";
import { beginScenario, endScenario, replayScenario } from "../parkReset";
import { cellAt, cellCentre, canShape, isLandTool, LAND_COST, LAND_TOOLS, levelAt, lineCells, rectCells, shapeLand } from "./terrain";
import { recordStep, undoStep } from "./undo";
import { accessOf, connectCost, connectPark, relinkPark } from "./links";

/** Why a ride or shop is shut, or null when guests can reach it. */
function accessReason(ctx: GameContext, id: string): string | null {
  const access = accessOf(ctx, id);
  return access === null || access.open ? null : `shut: ${access.reason}`;
}

/** Blueprints laid as a line when the pointer is dragged: press on the first cell, let go on the last. */
export const LINE_KINDS: ReadonlySet<string> = new Set(["path_walk", "path_queue"]);


export type PointerInput = Pick<PointerHit, "point" | "entity" | "object">;

let revision = 0;

export function bump(ctx: GameContext): void {
  revision += 1;
  ctx.game.store.set("__rev", revision);
  tracePark(ctx, "command");
}

const over = (ctx: GameContext): boolean => park.of(ctx).fact("park.game_over") === true;
const ribbonUp = (ctx: GameContext): boolean => {
  const w = park.of(ctx);
  return w.fact("park.won") === true && w.fact("park.win_dismissed") !== true;
};

/** A blueprint the palette offers: the world refuses a locked one; cost and room are checked at the spot. */
export function canBuild(ctx: GameContext, id: string): boolean {
  if (isLandTool(id)) return true;
  return Object.hasOwn(BUILDABLES, id) && park.of(ctx).canPlace(id)?.reason !== "locked";
}

/** Lay a dragged line of path or queue: every cell that can take one, as one undoable build. */
function layLine(ctx: GameContext, kind: string, from: readonly [number, number], to: readonly [number, number]): void {
  const w = park.of(ctx);
  const ids: string[] = [];
  let cost = 0;
  let refusal: string | null = null;
  for (const [col, row] of lineCells(cellAt(...from), cellAt(...to))) {
    const [x, z] = cellCentre(col, row);
    const check = placementAt(w, kind, x, z);
    if (!check.ok) { refusal ??= check.reason; continue; }
    const before = new Set(w.instances().map((instance) => instance.id));
    if (ctx.game.commands.run("brightway.place", { kind, cell: check.cell }).status !== "applied") continue;
    const placed = w.instances().find((instance) => !before.has(instance.id));
    if (placed !== undefined) ids.push(placed.id);
    cost += BUILDABLES[kind]!.cost;
  }
  if (ids.length === 0) {
    ctx.game.notices.push({ text: refusal ?? "Nothing could be laid there", tone: "deny" });
    return;
  }
  recordStep({ type: "place", ids, cost });
  ctx.game.notices.push({ text: `${ids.length} × ${BUILDABLES[kind]!.label} laid · -$${cost}`, tone: "success" });
  ctx.game.audio.play("place");
  savePark(ctx);
}

/** Raise or lower every cell in the dragged area that can move, as one undoable change. */
function shapeArea(ctx: GameContext, tool: keyof typeof LAND_TOOLS, from: readonly [number, number], to: readonly [number, number]): void {
  const w = park.of(ctx);
  const step = LAND_TOOLS[tool].step;
  const cells: { col: number; row: number; level: number }[] = [];
  let refusal: string | null = null;
  for (const [col, row] of rectCells(cellAt(...from), cellAt(...to))) {
    const level = levelAt(w, col, row);
    const refused = shapeLand(w, col, row, step);
    if (refused !== null) { refusal ??= refused; continue; }
    cells.push({ col, row, level });
  }
  if (cells.length === 0) {
    ctx.game.notices.push({ text: refusal ?? "The ground can't move there", tone: "deny" });
    return;
  }
  const cost = cells.length * LAND_COST;
  recordStep({ type: "land", cells, cost });
  relinkPark(ctx);
  ctx.game.notices.push({ text: `${step > 0 ? "Raised" : "Lowered"} ${cells.length} cell${cells.length === 1 ? "" : "s"} · -$${cost}`, tone: "success" });
  ctx.game.audio.play("place");
  savePark(ctx);
}

/** Can the land tool move this cell? The overlay tints the hovered cell from this. */
export function landCheck(ctx: GameContext, tool: string, x: number, z: number): string | null {
  if (!isLandTool(tool)) return null;
  const [col, row] = cellAt(x, z);
  const check = canShape(park.of(ctx), col, row, LAND_TOOLS[tool].step);
  return check.ok ? null : check.reason;
}

function selectTool(ctx: GameContext, id: string): void {
  if (!session.started || over(ctx) || !canBuild(ctx, id)) return;
  clearSelection(ctx);
  session.selectedTool = session.selectedTool === id ? null : id;
  bump(ctx);
}

/** Read the circuit back to the player whenever its shape changes: the same numbers the ride runs on. */
function announceCircuit(ctx: GameContext): void {
  const circuit = coasterCircuit(ctx);
  ctx.game.notices.push(circuit.closed
    ? { text: `Circuit closed · ${Math.round(circuit.length)} m · ${circuit.lapSeconds.toFixed(1)} s lap · excitement ${circuit.excitement.toFixed(1)}`, tone: "success" }
    : { text: `Coaster track at ${Math.round(circuit.length)} m — the loop is still open`, tone: "info" });
}

const LAID_IN_RUNS: ReadonlySet<string> = new Set(["track", "path", "scenery"]);

/** Build at the pointer: the park's track rule, then the world's own `brightway.place`. */
function tryBuild(ctx: GameContext, input: PointerInput): void {
  const kind = session.selectedTool;
  if (kind === null || !canBuild(ctx, kind)) return;
  if (!Array.isArray(input.point) || input.point.length !== 3 || !input.point.every(Number.isFinite)) return;
  const [x, , z] = input.point;
  const from = session.dragFrom;
  session.dragFrom = null;
  if (isLandTool(kind)) {
    shapeArea(ctx, kind, from ?? [x, z], [x, z]);
    return;
  }
  if (LINE_KINDS.has(kind) && from !== null && cellAt(...from).join() !== cellAt(x, z).join()) {
    layLine(ctx, kind, from, [x, z]);
    return;
  }
  const w = park.of(ctx);
  const check = placementAt(w, kind, x, z);
  if (!check.ok) {
    // The deny notice plays the park's own "denied" cue (audio.uiCues.deny).
    ctx.game.notices.push({ text: check.reason, tone: "deny" });
    return;
  }
  const before = new Set(w.instances().map((instance) => instance.id));
  if (ctx.game.commands.run("brightway.place", { kind, cell: check.cell }).status !== "applied") return;
  const placed = w.instances().find((instance) => !before.has(instance.id));
  if (placed !== undefined && session.rotation !== 0) {
    w.set(`${placed.id}.rot`, session.rotation);
    ctx.scene.object.rotate(placed.id, (session.rotation * Math.PI) / 2);
  }
  const def = BUILDABLES[kind]!;
  // A ride, stall or hire is placed once; track, paths and scenery are laid in runs and stay picked.
  if (!LAID_IN_RUNS.has(def.category)) session.selectedTool = null;
  if (placed !== undefined) recordStep({ type: "place", ids: [placed.id], cost: def.cost });
  const shut = placed === undefined ? null : accessReason(ctx, placed.id);
  ctx.game.notices.push({ text: `${def.label} built · -$${def.cost}${shut === null ? "" : ` · ${shut}`}`, tone: "success" });
  if (kind === "track_piece" || kind === "ride_coaster") announceCircuit(ctx);
  const at = placed?.position;
  ctx.game.audio.play("place", at === null || at === undefined ? undefined : [at[0], 0, at[1]]);
  savePark(ctx);
}

/** Drop both kinds of click selection: the park's inspected object and the engine's selected guest. */
function clearSelection(ctx: GameContext): void {
  session.selectedObject = null;
  ctx.scene.entity.selection.clear();
}

/**
 * Click selection. Guests are scene entities and structures are placed objects; the engine's pointer
 * hit reports each separately. A guest goes into the engine's shared entity selection
 * (`ctx.scene.entity.selection`, the set the shell draws its selection ring from) and an object into
 * the park's own `selectedObject` for its inspector. Picking one clears the other, so clicking a guest
 * can never leave the path beneath it selected.
 */
function selectGuestOrObject(ctx: GameContext, input: PointerInput): void {
  const guest = input.entity !== null && session.guests.has(input.entity) ? input.entity : null;
  session.selectedObject = guest === null && input.object !== null && park.of(ctx).instance(input.object) !== null ? input.object : null;
  ctx.scene.entity.selection.clear();
  if (guest !== null) ctx.scene.entity.selection.replace([guest]);
}

function pointerAction(ctx: GameContext, input: PointerInput): void {
  tracePark(ctx, "pointer", input);
  if (!session.started || over(ctx)) return;
  if (session.selectedTool !== null) {
    tryBuild(ctx, input);
    return;
  }
  selectGuestOrObject(ctx, input);
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ reduced: boolean }>("park.motion", { apply(state, input) { state.game.store.set("park.reduced-motion", input.reduced); } });
  ctx.game.commands.define("park.start", { apply(state) {
    session.started = true;
    openParkDay(state);
    if (over(state)) { setGamePhase(state, "ended"); state.time.pause(); }
    else if (ribbonUp(state)) { setGamePhase(state, "paused"); state.time.pause(); }
    else { setGamePhase(state, "playing"); state.time.play(); }
    syncAmbience(state);
    savePark(state); bump(state);
  } });
  ctx.game.commands.define("park.save", { apply(state) { savePark(state); bump(state); } });
  ctx.game.commands.define("park.new", { apply(state) {
    try {
      // Stop pagehide from saving the old live park over the fresh slot.
      archiveSave(); session.started = false;
      if (typeof window !== "undefined") window.location.reload();
    } catch { session.saveStatus = "Could not archive the old save. Free browser storage before starting a new park."; bump(state); }
  } });
  ctx.game.commands.define("park.continue", { apply(state) {
    if (!session.started || over(state)) return;
    park.of(state).set("park.win_dismissed", true); state.time.play(); setGamePhase(state, "playing"); savePark(state); bump(state);
  } });
  ctx.game.commands.define<{ speed: number }>("park.speed", { apply(state, input) {
    if (!session.started || over(state) || ribbonUp(state) || ![1, 2, 4].includes(input.speed)) return;
    state.time.setSpeed(input.speed); setGamePhase(state, "playing"); bump(state);
  } });
  ctx.game.commands.define<PointerInput>("park.pointer", {
    apply(state, input) {
      pointerAction(state, input);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.select", {
    apply(state, input) {
      selectTool(state, input.id);
    },
  });

  ctx.game.commands.define("build.clear", {
    apply(state) {
      session.selectedTool = null;
      clearSelection(state);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("park.scenario", {
    apply(state, input) {
      if (!beginScenario(state, input.id)) return;
      bump(state);
    },
  });

  ctx.game.commands.define("park.replay", {
    apply(state) {
      if (!replayScenario(state)) return;
      bump(state);
    },
  });

  ctx.game.commands.define("park.freeplay", {
    apply(state) {
      endScenario(state);
      bump(state);
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      if (!session.started || over(state) || ribbonUp(state)) return;
      state.time.toggle();
      setGamePhase(state, state.time.isPaused() ? "paused" : "playing");
      syncAmbience(state);
      savePark(state); bump(state);
    },
  });

  // The overlay marks where a left-button press began; the click that ends it lays the line or area.
  ctx.game.commands.define<{ point: [number, number] | null }>("build.dragFrom", {
    apply(_state, input) {
      session.dragFrom = input.point === null || !input.point.every(Number.isFinite) ? null : [input.point[0], input.point[1]];
    },
  });

  // The same line or area a drag lays, as one command (scripts and the drive tool use it).
  ctx.game.commands.define<{ kind: string; from: [number, number]; to: [number, number] }>("build.line", {
    apply(state, input) {
      if (!session.started || over(state) || !canBuild(state, input.kind)) return;
      if (isLandTool(input.kind)) shapeArea(state, input.kind, input.from, input.to);
      else if (LINE_KINDS.has(input.kind)) layLine(state, input.kind, input.from, input.to);
      bump(state);
    },
  });

  ctx.game.commands.define("build.undo", {
    apply(state) {
      if (!session.started || over(state)) return;
      const w = park.of(state);
      const line = undoStep(
        w,
        (kind, cell, rot) => {
          const id = placeFree(w, kind, cell);
          if (id !== null && rot !== 0) {
            w.set(`${id}.rot`, rot);
            state.scene.object.rotate(id, (rot * Math.PI) / 2);
          }
          return id;
        },
        (id) => state.game.commands.run("brightway.remove", { id }).status === "applied",
      );
      relinkPark(state);
      state.game.notices.push(line === null ? { text: "Nothing to undo", tone: "deny" } : { text: line, tone: "info" });
      if (line !== null) savePark(state);
      bump(state);
    },
  });

  // Demolish through here so the builder's undo can put it back.
  ctx.game.commands.define<{ id?: string }>("build.demolish", {
    apply(state, input) {
      const id = input.id ?? session.selectedObject;
      if (id === null) return;
      const w = park.of(state);
      const instance = w.instance(id);
      if (instance === null || instance.cell === null) return;
      const step = { type: "remove" as const, kind: instance.kind, cell: [instance.cell[0], instance.cell[1]] as [number, number], rot: w.num(`${id}.rot`), refund: refundOf(instance.kind) };
      if (state.game.commands.run("brightway.remove", { id }).status === "applied") recordStep(step);
      bump(state);
    },
  });

  // Lay the entrance, exit and paths a shut ride or shop needs, at the normal build prices.
  ctx.game.commands.define<{ id?: string }>("build.connect", {
    apply(state, input) {
      if (!session.started || over(state)) return;
      const id = input.id ?? session.selectedObject;
      if (id === null) return;
      const w = park.of(state);
      const cost = connectCost(state, id);
      if (cost > w.num("park.cash")) {
        state.game.notices.push({ text: `Connecting it costs $${cost} - not enough cash`, tone: "deny" });
        return;
      }
      const before = w.num("park.cash");
      const ids = connectPark(state, { only: id });
      const shut = accessReason(state, id);
      if (ids.length > 0) recordStep({ type: "place", ids, cost: before - w.num("park.cash") });
      state.game.notices.push(shut === null
        ? { text: `Connected · ${ids.length} pieces laid · -$${Math.round(before - w.num("park.cash"))}`, tone: "success" }
        : { text: `Couldn't connect it: ${shut}`, tone: "deny" });
      savePark(state);
      bump(state);
    },
  });

  ctx.game.commands.define("undoBuild", { apply(state) { state.game.commands.run("build.undo", {}); } });

  ctx.game.commands.define("rotateTool", {
    apply(state) {
      session.rotation = (session.rotation + 1) % 4;
      bump(state);
    },
  });

  ctx.game.commands.define("clearTool", {
    apply(state) {
      session.selectedTool = null;
      clearSelection(state);
      bump(state);
    },
  });

  const quick: Record<string, string> = {
    pickCarousel: "ride_carousel",
    pickCoaster: "ride_coaster",
    pickTrack: "track_piece",
    pickFood: "stall_food",
    pickTree: "deco_tree",
    pickPath: "path_walk",
  };
  for (const [command, buildId] of Object.entries(quick)) {
    ctx.game.commands.define(command, {
      apply(state) {
        selectTool(state, buildId);
      },
    });
  }
}
