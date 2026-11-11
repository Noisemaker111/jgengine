import { describe, expect, test } from "bun:test";
import { litPips } from "./kit";
import { editCallSign } from "./Menu";
import { splitTrackedQuests, spreadRadiusPx } from "./Hud";
import { createScrapHudPanels, HUD_PANELS, HUD_STORAGE_KEY } from "./hudPanels";

describe("splitTrackedQuests", () => {
  test("the first active quest gets the full card and the rest collapse to lines", () => {
    const { primary, others } = splitTrackedQuests(["main", "side", "extra"]);
    expect(primary).toBe("main");
    expect(others).toEqual(["side", "extra"]);
  });

  test("a single active quest has no collapsed lines", () => {
    expect(splitTrackedQuests(["only"])).toEqual({ primary: "only", others: [] });
  });

  test("no active quest leaves nothing to show", () => {
    expect(splitTrackedQuests<string>([])).toEqual({ primary: undefined, others: [] });
  });
});

describe("rig readouts", () => {
  test("any value above zero lights at least one pip, and a full gauge lights every pip", () => {
    expect(litPips(0, 100, 12)).toBe(0);
    expect(litPips(0.1, 100, 12)).toBe(1);
    expect(litPips(50, 100, 12)).toBe(6);
    expect(litPips(100, 100, 12)).toBe(12);
    expect(litPips(150, 100, 12)).toBe(12);
  });

  test("the reticle opens with the cone and closes as the field of view narrows", () => {
    expect(spreadRadiusPx(0, 70, 720)).toBe(0);
    const wide = spreadRadiusPx(0.03, 70, 720);
    expect(wide).toBeGreaterThan(0);
    expect(spreadRadiusPx(0.03, 35, 720)).toBeGreaterThan(wide);
  });

  test("the call sign takes letters, digits, space and hyphen, caps at 24 and erases with Backspace", () => {
    let sign = "";
    for (const code of ["KeyR", "KeyX", "Minus", "Digit7", "Space", "Comma", "ShiftLeft"]) sign = editCallSign(sign, code);
    expect(sign).toBe("RX-7 ");
    expect(editCallSign(sign, "Backspace")).toBe("RX-7");
    expect(editCallSign("A".repeat(24), "KeyB")).toBe("A".repeat(24));
  });
});

describe("hideable HUD panels", () => {
  const memory = () => { const map = new Map<string, string>(); return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } }; };

  test("every panel starts shown, a toggle hides it and a second toggle brings it back", () => {
    const panels = createScrapHudPanels(memory());
    expect(HUD_PANELS.every(p => panels.visible(p.id))).toBe(true);
    panels.toggle("echo");
    expect(panels.visible("echo")).toBe(false);
    expect(panels.visible("missions")).toBe(true);
    panels.toggle("echo");
    expect(panels.visible("echo")).toBe(true);
  });

  test("choices persist under the old HUD layout key and survive a reload", () => {
    const storage = memory();
    const first = createScrapHudPanels(storage);
    let changes = 0;
    first.subscribe(() => { changes += 1; });
    first.toggle("field-notes");
    first.toggle("loot-toasts");
    expect(changes).toBe(2);
    expect(storage.map.has(HUD_STORAGE_KEY)).toBe(true);
    const reloaded = createScrapHudPanels(storage);
    expect(reloaded.visible("field-notes")).toBe(false);
    expect(reloaded.visible("loot-toasts")).toBe(false);
    expect(reloaded.visible("overdrive")).toBe(true);
  });

  test("a choice saved by the old HUD canvas still applies", () => {
    const storage = memory();
    storage.setItem(HUD_STORAGE_KEY, JSON.stringify({ v: 2, panels: { missions: { anchor: "left", dx: 0, dy: 0, visible: false } } }));
    expect(createScrapHudPanels(storage).visible("missions")).toBe(false);
  });
});
