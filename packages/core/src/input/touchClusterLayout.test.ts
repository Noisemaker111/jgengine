import { describe, expect, test } from "bun:test";

import { deriveTouchScheme } from "@jgengine/core/input/touchScheme";

import { floatingJoystickZoneHeight, mainButtonIndex, touchClusterLayout, touchClusterSizes, touchDockInsets } from "./touchClusterLayout";
import { touchButtonFace, touchInitials } from "./touchIcons.view";

const RESERVED = new Set(["moveForward", "moveBack", "moveLeft", "moveRight", "jump", "sprint", "interact", "crouch"]);

/** Scrap Signal's real bindings: the 14-button dock this layout replaced. */
const SHOOTER_INPUT = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  crouch: ["KeyC"],
  interact: ["KeyE"],
  fire: ["mouse0"],
  aim: ["mouse2"],
  reload: ["KeyR"],
  throwGrenade: ["KeyG"],
  useHealthVial: ["KeyQ"],
  selectSlot1: ["Digit1"],
  selectSlot2: ["Digit2"],
  selectSlot3: ["Digit3"],
  selectSlot4: ["Digit4"],
  openSkills: ["KeyK"],
};

describe("touchClusterSizes", () => {
  test("the main button is larger than secondaries and both scale with the short side", () => {
    const phone = touchClusterSizes(360);
    expect(phone.main).toBeGreaterThan(phone.secondary * 1.5);
    expect(phone.main).toBeGreaterThanOrEqual(64);
    expect(phone.secondary).toBeGreaterThanOrEqual(40);
    const tablet = touchClusterSizes(1024);
    expect(tablet.main).toBeGreaterThan(phone.main);
    expect(tablet.main).toBeLessThanOrEqual(112);
    expect(tablet.secondary).toBeLessThanOrEqual(66);
  });
});

describe("touchClusterLayout", () => {
  test("secondaries ring the main button without overlapping it, each other, or leaving the box", () => {
    const sizes = touchClusterSizes(360);
    const layout = touchClusterLayout(8, sizes);
    expect(layout.secondaries).toHaveLength(8);
    const center = (right: number, bottom: number, size: number) => ({ x: right + size / 2, y: bottom + size / 2 });
    const main = center(0, 0, sizes.main);
    const placed = layout.secondaries.map((offset) => center(offset.right, offset.bottom, sizes.secondary));
    for (const [index, point] of placed.entries()) {
      expect(Math.hypot(point.x - main.x, point.y - main.y)).toBeGreaterThanOrEqual(sizes.main / 2 + sizes.secondary / 2);
      for (const other of placed.slice(index + 1)) {
        expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(sizes.secondary - 1);
      }
    }
    for (const offset of layout.secondaries) {
      expect(offset.right).toBeGreaterThanOrEqual(0);
      expect(offset.bottom).toBeGreaterThanOrEqual(0);
    }
    // Eight secondaries fit in two arcs, so the cluster stays well inside a 360px-tall phone.
    expect(layout.height).toBeLessThan(200);
    expect(layout.width).toBeLessThan(220);
  });

  test("the main button is the game's pick, else the fire verb, else the first", () => {
    expect(mainButtonIndex([{ action: "jump" }, { action: "fire" }])).toBe(1);
    expect(mainButtonIndex([{ action: "fire" }, { action: "cast", main: true }])).toBe(1);
    expect(mainButtonIndex([{ action: "brake" }, { action: "boost" }])).toBe(0);
    expect(mainButtonIndex([])).toBe(-1);
  });
});

describe("touchButtonFace", () => {
  const face = (action: string, icon: string | false | null = null, label = action) => touchButtonFace({ action, label, icon });

  test("known shooter verbs get glyphs, never sentences", () => {
    expect(face("fire")).toEqual({ kind: "glyph", name: "fire" });
    expect(face("aim")).toEqual({ kind: "glyph", name: "aim" });
    expect(face("reload")).toEqual({ kind: "glyph", name: "reload" });
    expect(face("throwGrenade")).toEqual({ kind: "glyph", name: "bomb" });
    expect(face("useHealthVial")).toEqual({ kind: "glyph", name: "potionRed" });
    expect(face("openSkills")).toEqual({ kind: "glyph", name: "star" });
    expect(face("jump")).toEqual({ kind: "glyph", name: "jump" });
    expect(face("crouch")).toEqual({ kind: "glyph", name: "crouch" });
    expect(face("interact")).toEqual({ kind: "glyph", name: "hand" });
    expect(face("useAbility")).toEqual({ kind: "glyph", name: "lightning" });
    expect(face("map")).toEqual({ kind: "glyph", name: "map" });
    expect(face("pause")).toEqual({ kind: "glyph", name: "pause" });
  });

  test("unknown actions fall back to short initials; a game icon or short glyph overrides", () => {
    expect(face("relay.overclock", null, "Relay.overclock")).toEqual({ kind: "text", text: "RO" });
    expect(face("honk", null, "Honk")).toEqual({ kind: "text", text: "HO" });
    expect(face("honk", "star")).toEqual({ kind: "glyph", name: "star" });
    expect(face("honk", "H")).toEqual({ kind: "text", text: "H" });
    expect(face("flightYawLeft", false, "Yaw L")).toEqual({ kind: "text", text: "Yaw L" });
    expect(face("flightVectorToggle", false, "Vector Thrust Toggle")).toEqual({ kind: "text", text: "VTT" });
    expect(touchInitials("Exit Vehicle")).toBe("EV");
  });
});

describe("touchDockInsets", () => {
  test("only the corners the dock occupies are reserved; bottom-centre stays free", () => {
    const scheme = deriveTouchScheme(SHOOTER_INPUT, { reserved: RESERVED, firstPerson: true });
    expect(scheme?.slots).toEqual(["selectSlot1", "selectSlot2", "selectSlot3", "selectSlot4"]);
    const insets = touchDockInsets(scheme, 0.88, 360);
    expect(insets.center).toBe(0);
    expect(insets.left).toBeGreaterThan(0);
    expect(insets.right).toBeGreaterThan(insets.left);
    // The whole right-thumb stack (cluster, slot strip, skills chip) leaves room above it on a 360px-tall phone.
    expect(insets.right).toBeLessThan(300);
  });

  test("the floating stick's taller capture zone is what the movement corner reserves", () => {
    const scheme = deriveTouchScheme(SHOOTER_INPUT, { reserved: RESERVED, firstPerson: true });
    const zone = floatingJoystickZoneHeight(360, 0.88);
    expect(zone).toBeCloseTo(144);
    expect(touchDockInsets(scheme, 0.88, 360, zone).left).toBeGreaterThan(touchDockInsets(scheme, 0.88, 360).left);
    expect(floatingJoystickZoneHeight(2000)).toBe(260);
  });

  test("a bottom-centre utility row reserves the centre, and a missing scheme reserves nothing", () => {
    const scheme = deriveTouchScheme(
      { fire: ["mouse0"], toggleMap: ["KeyM"] },
      { reserved: RESERVED, firstPerson: false, config: { layout: { utility: "bottom-center" } } },
    );
    const insets = touchDockInsets(scheme, 1, 390);
    expect(insets.center).toBeGreaterThan(0);
    expect(insets.left).toBe(0);
    expect(touchDockInsets(null)).toEqual({ left: 0, center: 0, right: 0 });
  });
});
