import { describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { closeTopPanel, createPanelState, isOpen, panelByHotkey, togglePanel } from "@jgengine/core/ui/panelModel";

import { game } from "../../game.config";
import { keybinds } from "../keybinds";
import { content } from "../content";
import { session } from "../session";
import { park } from "../park";
import { DAY_LENGTH } from "../catalog";
import { seedGuests } from "../sim/guests";
import { BUILD_PANEL, PARK_PANELS } from "../ui/panels";

const runner = () => createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });

describe("the build palette is a toggleable window", () => {
  test("starts open, B toggles it, Escape closes it", () => {
    const defs = PARK_PANELS;
    const open = createPanelState(defs);
    expect(isOpen(open, BUILD_PANEL)).toBe(true);
    // B is the palette's key and it toggles: closed on the first press, back on the second.
    expect(panelByHotkey(defs, "KeyB")).toBe(BUILD_PANEL);
    const closed = togglePanel(open, BUILD_PANEL);
    expect(isOpen(closed, BUILD_PANEL)).toBe(false);
    expect(isOpen(togglePanel(closed, BUILD_PANEL), BUILD_PANEL)).toBe(true);
    // Escape closes the top closable window while it is open, and does nothing once it is closed.
    expect(isOpen(closeTopPanel(open), BUILD_PANEL)).toBe(false);
    expect(closeTopPanel(closed)).toEqual(closed);
  });

  test("the palette hotkey does not collide with a park action key", () => {
    const codes = Object.values(keybinds).flatMap((value) =>
      Array.isArray(value) ? [...value] : [...(value.hold ?? []), ...(value.toggle ?? [])],
    );
    expect(PARK_PANELS.length).toBeGreaterThan(0);
    for (const def of PARK_PANELS) {
      expect(def.hotkey).toBeDefined();
      expect(codes).not.toContain(def.hotkey);
    }
  });
});

describe("placement mode", () => {
  test("a one-off build ends placement; a path keeps laying", () => {
    const live = runner();
    live.ui.invoke("park.start");
    live.ui.invoke("build.select", { id: "path_walk" });
    live.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    expect(park.of(live.ctx).instances().at(-1)!.kind).toBe("path_walk");
    expect(session.selectedTool).toBe("path_walk");
    live.ui.invoke("build.select", { id: "staff_janitor" });
    live.ui.invoke("park.pointer", { point: [-36, 0, -28], object: null, entity: null });
    expect(park.of(live.ctx).instances().at(-1)!.kind).toBe("staff_janitor");
    expect(session.selectedTool).toBeNull();
  });
});

describe("click selection", () => {
  test("a guest click selects the guest and drops the path that was selected", () => {
    const live = runner();
    live.ui.invoke("park.start");
    live.ui.invoke("build.select", { id: "path_walk" });
    live.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    live.ui.invoke("build.clear");
    const path = park.of(live.ctx).instances().at(-1)!;
    expect(path.kind).toBe("path_walk");

    // Clicking the path selects the path.
    const [x, z] = path.position!;
    live.ui.invoke("park.pointer", { point: [x, 0, z], object: path.id, entity: null });
    expect(session.selectedObject).toBe(path.id);
    expect(live.ctx.scene.entity.selection.size()).toBe(0);

    // A guest stands on that path: the engine reports it as `entity`, so the guest wins.
    seedGuests(live.ctx, 1);
    const guest = [...session.guests.keys()][0]!;
    live.ui.invoke("park.pointer", { point: [x, 0, z], object: path.id, entity: guest });
    expect(session.selectedObject).toBeNull();
    expect(live.ctx.scene.entity.selection.list()).toEqual([guest]);

    // Clicking open ground clears both.
    live.ui.invoke("park.pointer", { point: [30, 0, 30], object: null, entity: null });
    expect(session.selectedObject).toBeNull();
    expect(live.ctx.scene.entity.selection.size()).toBe(0);
  });

  test("a departing guest leaves the shared selection", () => {
    const live = runner();
    live.ui.invoke("park.start");
    seedGuests(live.ctx, 1);
    const guest = [...session.guests.keys()][0]!;
    live.ui.invoke("park.pointer", { point: [0, 0, 0], object: null, entity: guest });
    expect(live.ctx.scene.entity.selection.has(guest)).toBe(true);
    // Night closes the gates sends guests home; the selection must not outlive them.
    live.ctx.time.hydrate({ ...live.ctx.time.snapshot(), now: DAY_LENGTH * 0.95, paused: false });
    for (let frame = 0; frame < 200 && session.guests.has(guest); frame++) live.step(1);
    expect(session.guests.has(guest)).toBe(false);
    expect(live.ctx.scene.entity.selection.has(guest)).toBe(false);
  });
});
