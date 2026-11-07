import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { GRASS_GAME_VIEWS, GRASS_REFERENCE_PHOTOS, GRASS_STYLE_TARGETS } from "../../../apps/dev/src/demo/grassReference";
import { GRASS_PRESETS } from "../../../packages/core/src/grass/grassKind";
import { boardShots, coverResize, drawLabel, labelWidth, parseBoardArgs, shotDifference, shotsToTake } from "./grassBoard";

const root = resolve(import.meta.dir, "../../..");

function solid(width: number, height: number, rgb: readonly [number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
  return { width, height, data };
}

describe("grass board", () => {
  test("every reference photo is committed, credited in CREDITS.md and grows a shipped species", () => {
    const credits = readFileSync(join(root, "CREDITS.md"), "utf8");
    const species = new Set<string>(GRASS_PRESETS.map((preset) => preset.id));
    for (const photo of GRASS_REFERENCE_PHOTOS) {
      expect(existsSync(join(import.meta.dir, "photos", photo.file))).toBe(true);
      expect(credits).toContain(photo.credit.source);
      expect(species.has(photo.species)).toBe(true);
    }
  });

  test("the stylised targets are set by game views the board shoots", () => {
    const views = new Set(GRASS_GAME_VIEWS.map((view) => view.id));
    for (const target of GRASS_STYLE_TARGETS) for (const view of target.views) expect(views.has(view)).toBe(true);
    expect(GRASS_GAME_VIEWS).toHaveLength(18);
  });

  test("a plain board shoots the photo views as they are and the stylised targets' game views", () => {
    const shots = boardShots(parseBoardArgs([]));
    expect(shots.filter((shot) => shot.file.startsWith("ref/")).map((shot) => shot.file)).toEqual(GRASS_REFERENCE_PHOTOS.map((photo) => `ref/${photo.id}-today.png`));
    expect(shots.filter((shot) => shot.file.startsWith("views/")).map((shot) => shot.file)).toEqual(["views/hh-park.png", "views/hh-park-low.png", "views/bb-moor.png", "views/bb-moor-low.png"]);
    expect(shots.find((shot) => shot.file === "views/hh-park.png")?.argv).toEqual(["harbor-heat", "--mode", "play", "--look", "0,60", "--look-from", "12,2.2,0.6"]);
  });

  test("realism levels each reshoot the photo views with the level as a page parameter", () => {
    const shots = boardShots(parseBoardArgs(["--realism", "0,0.5,1", "--only", "pasture"]));
    expect(shots.map((shot) => shot.file)).toEqual(["ref/pasture-r0.png", "ref/pasture-r0.5.png", "ref/pasture-r1.png"]);
    expect(shots[1]!.argv).toEqual(["grass-reference", "--mode", "play", "--view", "ref-pasture", "--param", "realism=0.5"]);
  });

  test("--views and --species add the 18 game views and a look and close shot per species", () => {
    const shots = boardShots(parseBoardArgs(["--views", "--species"]));
    expect(shots.filter((shot) => shot.file.startsWith("views/"))).toHaveLength(18);
    expect(shots.filter((shot) => shot.file.startsWith("species/"))).toHaveLength(GRASS_PRESETS.length * 2);
  });

  test("--views with realism levels shoots every game view at each level, and the stylised targets as the games stand", () => {
    const shots = boardShots(parseBoardArgs(["--views", "--realism", "0,1"])).filter((shot) => shot.file.startsWith("views/"));
    expect(shots).toHaveLength(4 + 18 * 2);
    expect(shots.filter((shot) => !shot.argv.includes("--param")).map((shot) => shot.file)).toEqual(["views/hh-park.png", "views/hh-park-low.png", "views/bb-moor.png", "views/bb-moor-low.png"]);
    const atOne = shots.find((shot) => shot.file === "views/fw-plains-r1.png");
    expect(atOne?.argv).toEqual(["fernwild", "--mode", "play", "--look", "-180,800", "--look-from", "12,2.4,0.6", "--param", "realism=1"]);
  });

  test("--resume shoots only the shots the board folder lacks", () => {
    const out = mkdtempSync(join(tmpdir(), "grass-board-"));
    try {
      mkdirSync(join(out, "ref"), { recursive: true });
      writeFileSync(join(out, "ref", "pasture-today.png"), "");
      const shots = boardShots(parseBoardArgs(["--out", out]));
      expect(shotsToTake(parseBoardArgs(["--out", out]), shots)).toHaveLength(shots.length);
      const left = shotsToTake(parseBoardArgs(["--out", out, "--resume"]), shots).map((shot) => shot.file);
      expect(left).toHaveLength(shots.length - 1);
      expect(left).not.toContain("ref/pasture-today.png");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("flags are checked", () => {
    expect(() => parseBoardArgs(["--realism", "2"])).toThrow(/0\.\.1/);
    expect(() => parseBoardArgs(["--frobnicate"])).toThrow(/unknown flag/);
    expect(() => parseBoardArgs(["--out"])).toThrow(/needs a value/);
    expect(parseBoardArgs(["--quality", "high", "--timeout", "300"]).shoot).toEqual(["--quality", "high", "--timeout", "300"]);
  });

  test("cover resize crops to the cell's aspect before sampling", () => {
    const wide = solid(40, 10, [0, 0, 255]);
    for (let y = 0; y < 10; y += 1) for (let x = 15; x < 25; x += 1) wide.data.set([255, 0, 0, 255], (y * 40 + x) * 4);
    const cell = coverResize(wide, 4, 4);
    expect([...cell.data.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...cell.data.subarray((4 * 4 - 1) * 4, (4 * 4 - 1) * 4 + 3)]).toEqual([255, 0, 0]);
  });

  test("a label draws white stencil pixels on a black plate", () => {
    const image = solid(100, 40, [90, 90, 90]);
    drawLabel(image, "A1", 0, 0, 2);
    const at = (x: number, y: number) => [...image.data.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 3)];
    expect(at(0, 0)).toEqual([0, 0, 0]);
    expect(at(4 + 2 * 1, 4)).toEqual([255, 255, 255]);
    expect(at(labelWidth("A1", 2) + 20, 30)).toEqual([90, 90, 90]);
  });

  test("shot difference is zero for the same picture and counts moved pixels", () => {
    const a = solid(10, 10, [100, 100, 100]);
    expect(shotDifference(a, a)).toEqual({ mean: 0, changed: 0 });
    const b = solid(10, 10, [100, 100, 100]);
    for (let i = 0; i < 50 * 4; i += 4) b.data.set([200, 200, 200], i);
    const { mean, changed } = shotDifference(a, b);
    expect(changed).toBeCloseTo(0.5, 5);
    expect(mean).toBeCloseTo(50, 1);
  });
});
