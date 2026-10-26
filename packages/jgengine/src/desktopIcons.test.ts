import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeGame } from "./create";
import { buildPlan, parseDesktopArgs, writeStaging } from "./desktop";
import { decodePng, encodePng, type RgbaImage } from "@jgengine/assets/imageCodec";

import { buildDesktopIcons, DESKTOP_ICON_FILES } from "./desktopIcons";

function icoEntries(ico: Uint8Array): Array<{ width: number; height: number; isPng: boolean }> {
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  expect(view.getUint16(0, true)).toBe(0);
  expect(view.getUint16(2, true)).toBe(1);
  const count = view.getUint16(4, true);
  return Array.from({ length: count }, (_, index) => {
    const at = 6 + index * 16;
    const offset = view.getUint32(at + 12, true);
    return {
      width: ico[at] === 0 ? 256 : ico[at]!,
      height: ico[at + 1] === 0 ? 256 : ico[at + 1]!,
      isPng: ico[offset] === 0x89 && ico[offset + 1] === 0x50,
    };
  });
}

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return { width, height, data };
}

describe("desktop icons", () => {
  test("the default set has a Windows icon.ico and RGBA PNGs at every size Tauri reads", () => {
    const files = buildDesktopIcons(null);
    expect(Object.keys(files).sort()).toEqual([...DESKTOP_ICON_FILES].sort());
    expect(icoEntries(files["icon.ico"]!).map((entry) => entry.width)).toEqual([16, 24, 32, 48, 64, 256]);
    expect(icoEntries(files["icon.ico"]!).at(-1)!.isPng).toBe(true);
    const sizes = { "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512 } as const;
    for (const [name, size] of Object.entries(sizes)) {
      const png = decodePng(files[name]!);
      expect([png.width, png.height]).toEqual([size, size]);
      expect(files[name]![25]).toBe(6);
    }
    const mark = decodePng(files["icon.png"]!);
    const pixel = (x: number, y: number) => Array.from(mark.data.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(256, 40)).toEqual([10, 12, 15, 255]);
    expect(pixel(352, 352)).toEqual([255, 107, 44, 255]);
  });

  test("a game's own wide cover is centre-cropped and resampled", () => {
    const cover = solid(300, 100, [0, 0, 255, 255]);
    for (let y = 0; y < 100; y += 1) {
      for (let x = 100; x < 200; x += 1) cover.data.set([255, 0, 0, 255], (y * 300 + x) * 4);
    }
    const files = buildDesktopIcons(encodePng(cover));
    const icon = decodePng(files["32x32.png"]!);
    expect(Array.from(icon.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(icon.data.subarray(icon.data.length - 4))).toEqual([255, 0, 0, 255]);
    expect(icoEntries(files["icon.ico"]!).length).toBe(6);
  });

  test("staging a created game writes icon.ico from its cover.png and lists it for Tauri", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "jgengine-desktop-icons-")), "probe-game");
    writeGame(dir, "probe-game", "Probe Game", "standalone");
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "public", "cover.png"), encodePng(solid(64, 40, [20, 200, 90, 255])));
    const parsed = parseDesktopArgs([dir, "--dry-run", "--out", join(dir, "stage")]);
    if ("error" in parsed) throw new Error(parsed.error);
    const plan = buildPlan(parsed, dir);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.iconSource).toBe(join(dir, "public", "cover.png"));
    const stage = writeStaging(plan);
    const icons = join(stage.stagingDir, "src-tauri", "icons");
    for (const name of DESKTOP_ICON_FILES) expect(existsSync(join(icons, name))).toBe(true);
    const conf = JSON.parse(readFileSync(stage.tauriConfPath, "utf8")) as { bundle: { icon: string[] } };
    expect(conf.bundle.icon).toContain("icons/icon.ico");
    const icon = decodePng(readFileSync(join(icons, "128x128.png")));
    expect(Array.from(icon.data.subarray(0, 4))).toEqual([20, 200, 90, 255]);
  });

  test("an unreadable project icon falls back to the jgengine mark; an explicit one is an error", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "jgengine-desktop-icons-")), "probe-game");
    writeGame(dir, "probe-game", "Probe Game", "standalone");
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "public", "icon.png"), "not a png");
    const parsed = parseDesktopArgs([dir, "--dry-run"]);
    if ("error" in parsed) throw new Error(parsed.error);
    const plan = buildPlan(parsed, dir);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.iconSource).toBeNull();
    expect(plan.iconWarning).toContain("not a PNG");
    const explicit = parseDesktopArgs([dir, "--dry-run", "--icon", join(dir, "public", "icon.png")]);
    if ("error" in explicit) throw new Error(explicit.error);
    const refused = buildPlan(explicit, dir);
    expect("error" in refused && refused.error).toContain("not a PNG");
  });
});
