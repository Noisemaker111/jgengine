import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { GRASS_GAME_VIEWS, GRASS_REFERENCE_PHOTOS, GRASS_STYLE_TARGETS } from "../../../apps/dev/src/demo/grassReference";
import { GRASS_PRESETS } from "../../../packages/core/src/grass/grassKind";
import { readStepFile, STEP_FILE_ENV } from "../../hangReport";
import { BOARD_MORE_EXIT, boardShots, boardSource, coverResize, drawLabel, fitsBudget, labelWidth, parseBoardArgs, readManifest, runBoard, shotDifference, shotsToTake, type BoardDeps } from "./grassBoard";

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

  describe("bounded runs", () => {
    let out = "";
    beforeEach(() => {
      out = mkdtempSync(join(tmpdir(), "grass-board-"));
    });
    afterEach(() => {
      rmSync(out, { recursive: true, force: true });
    });

    /** A stand-in world: each capture takes `shotMs` on a fake clock and writes its file unless `fails` says not. */
    function world(options: { source?: string; shotMs?: number; fails?: (file: string) => boolean; during?: (file: string) => void } = {}) {
      let clock = 0;
      const captured: string[] = [];
      const composed: number[] = [];
      const deps: BoardDeps = {
        now: () => clock,
        source: () => options.source ?? "tree-a",
        log: () => {},
        compose: () => composed.push(clock),
        capture: (args, shot) => {
          captured.push(shot.file);
          options.during?.(shot.file);
          clock += options.shotMs ?? 60_000;
          if (options.fails?.(shot.file)) return false;
          mkdirSync(dirname(join(args.out, shot.file)), { recursive: true });
          writeFileSync(join(args.out, shot.file), "png");
          return true;
        },
      };
      return { deps, captured, composed };
    }
    const three = (...extra: string[]) => parseBoardArgs(["--out", out, "--realism", "0,0.5,1", "--only", "pasture", "--budget", "100", ...extra]);

    test("a run stops at its budget with exit 3, and the same command carries on until the last shot lays out the sheets", () => {
      const w = world();
      expect(runBoard(three(), w.deps)).toBe(BOARD_MORE_EXIT);
      expect(w.captured).toEqual(["ref/pasture-r0.png"]);
      expect(w.composed).toHaveLength(0);
      expect(Object.keys(readManifest(out)!.done)).toEqual(["ref/pasture-r0.png"]);
      expect(runBoard(three(), w.deps)).toBe(BOARD_MORE_EXIT);
      expect(runBoard(three(), w.deps)).toBe(0);
      // Every shot taken exactly once across the three runs, and the sheets laid out once, at the end.
      expect(w.captured).toEqual(["ref/pasture-r0.png", "ref/pasture-r0.5.png", "ref/pasture-r1.png"]);
      expect(w.composed).toHaveLength(1);
    });

    test("a longer --timeout keeps the shots already landed; another graphics tier retakes them", () => {
      expect(runBoard(three("--timeout", "60"), world().deps)).toBe(BOARD_MORE_EXIT);
      const longer = world({ shotMs: 10_000 });
      expect(runBoard(three("--timeout", "300"), longer.deps)).toBe(0);
      expect(longer.captured).toEqual(["ref/pasture-r0.5.png", "ref/pasture-r1.png"]);
      const tier = world({ shotMs: 10_000 });
      expect(runBoard(three("--quality", "low"), tier.deps)).toBe(0);
      expect(tier.captured).toHaveLength(3);
    });

    test("a big enough budget takes the whole board in one run", () => {
      const w = world({ shotMs: 10_000 });
      expect(runBoard(three(), w.deps)).toBe(0);
      expect(w.captured).toHaveLength(3);
    });

    test("a run killed mid-capture loses only that capture: its half-written file is retaken, landed shots are kept", () => {
      const killed = world({
        during: (file) => {
          if (file !== "ref/pasture-r0.5.png") return;
          writeFileSync(join(out, file), "half");
          throw new Error("killed");
        },
        shotMs: 10_000,
      });
      expect(() => runBoard(three(), killed.deps)).toThrow("killed");
      const next = world({ shotMs: 10_000 });
      expect(runBoard(three(), next.deps)).toBe(0);
      expect(next.captured).toEqual(["ref/pasture-r0.5.png", "ref/pasture-r1.png"]);
      expect(readFileSync(join(out, "ref/pasture-r0.5.png"), "utf8")).toBe("png");
    });

    test("a failing shot is never dropped: every run names it and exits 1, no sheets are laid out, and the board finishes only once it lands", () => {
      let broken = true;
      const lines: string[] = [];
      const w = world({ shotMs: 10_000, fails: (file) => broken && file === "ref/pasture-r0.png" });
      w.deps.log = (line) => lines.push(line);
      for (let run = 0; run < 5; run += 1) expect(runBoard(three(), w.deps)).toBe(1);
      // Tried once per run with no cap, the other shots taken once, and never a sheet with a gap.
      expect(w.captured.filter((file) => file === "ref/pasture-r0.png")).toHaveLength(5);
      expect(w.captured.filter((file) => file !== "ref/pasture-r0.png")).toEqual(["ref/pasture-r0.5.png", "ref/pasture-r1.png"]);
      expect(w.composed).toHaveLength(0);
      expect(readManifest(out)!.failed).toEqual({ "ref/pasture-r0.png": 5 });
      expect(lines.filter((line) => line.includes("failed and are still missing: ref/pasture-r0.png (5 failed)"))).toHaveLength(1);
      expect(lines.at(-1)).toContain("2/3 shots");
      broken = false;
      expect(runBoard(three(), w.deps)).toBe(0);
      expect(w.composed).toHaveLength(1);
      expect(readManifest(out)!.failed).toEqual({});
    });

    test("a failed shot waits behind untried ones, so one broken view never holds up the rest of a board", () => {
      const w = world({ shotMs: 10_000, fails: (file) => file === "ref/pasture-r0.png" });
      expect(runBoard(three("--only", "pasture,hay-anglesey"), w.deps)).toBe(1);
      const next = world({ shotMs: 10_000 });
      expect(runBoard(three("--only", "pasture,hay-anglesey"), next.deps)).toBe(0);
      expect(next.captured).toEqual(["ref/pasture-r0.png"]);
    });

    test("shots taken with other code are retaken; --resume keeps them", () => {
      const first = world({ source: "tree-a" });
      expect(runBoard(three(), first.deps)).toBe(BOARD_MORE_EXIT);
      const changed = world({ source: "tree-b", shotMs: 10_000 });
      expect(runBoard(three(), changed.deps)).toBe(0);
      expect(changed.captured).toContain("ref/pasture-r0.png");
      rmSync(join(out, "ref/pasture-r1.png"));
      const resumed = world({ source: "tree-c", shotMs: 10_000 });
      expect(runBoard(three("--resume"), resumed.deps)).toBe(0);
      expect(resumed.captured).toEqual(["ref/pasture-r1.png"]);
    });

    test("each capture names itself in the guard's step file, so a hard kill says which shot hung", () => {
      const stepFile = join(out, "step.json");
      const before = process.env[STEP_FILE_ENV];
      process.env[STEP_FILE_ENV] = stepFile;
      const seen: string[] = [];
      try {
        const w = world({ shotMs: 10_000, during: () => seen.push(readStepFile(stepFile)?.label ?? "none") });
        runBoard(three(), w.deps);
      } finally {
        if (before === undefined) delete process.env[STEP_FILE_ENV];
        else process.env[STEP_FILE_ENV] = before;
      }
      expect(seen).toEqual(["board shot 1/3 ref/pasture-r0.png", "board shot 2/3 ref/pasture-r0.5.png", "board shot 3/3 ref/pasture-r1.png"]);
    });

    test("the code identity follows the working tree's content, not its commits, and leaves the checkout's index alone", () => {
      const git = (...args: string[]) => spawnSync("git", args, { cwd: out, encoding: "utf8" });
      git("init", "-q");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      writeFileSync(join(out, "a.txt"), "one");
      const dirty = boardSource(out);
      expect(git("diff", "--cached", "--name-only").stdout.trim()).toBe("");
      git("add", "a.txt");
      git("commit", "-q", "-m", "a");
      expect(boardSource(out)).toBe(dirty);
      writeFileSync(join(out, "a.txt"), "two");
      expect(boardSource(out)).not.toBe(dirty);
    });

    test("one more capture fits only when the slowest so far ends inside the budget; the first always does", () => {
      expect(fitsBudget(10_000_000, 0, 0, 1)).toBe(true);
      expect(fitsBudget(40_000, 60_000, 1, 100)).toBe(true);
      expect(fitsBudget(41_000, 60_000, 1, 100)).toBe(false);
    });

    test("the shots left put untried ones before failed ones and keep a shot however often it failed", () => {
      const shots = boardShots(three());
      const manifest = { version: 1 as const, source: "x", done: { "ref/pasture-r0.png": "k" }, failed: { "ref/pasture-r0.5.png": 1 } };
      expect(shotsToTake(manifest, shots).map((shot) => shot.file)).toEqual(["ref/pasture-r1.png", "ref/pasture-r0.5.png"]);
      manifest.failed["ref/pasture-r0.5.png"] = 1000;
      expect(shotsToTake(manifest, shots).map((shot) => shot.file)).toEqual(["ref/pasture-r1.png", "ref/pasture-r0.5.png"]);
    });
  });

  test("flags are checked", () => {
    expect(() => parseBoardArgs(["--realism", "2"])).toThrow(/0\.\.1/);
    expect(() => parseBoardArgs(["--frobnicate"])).toThrow(/unknown flag/);
    expect(() => parseBoardArgs(["--out"])).toThrow(/needs a value/);
    expect(parseBoardArgs(["--quality", "high", "--timeout", "300"]).shoot).toEqual(["--quality", "high", "--timeout", "300"]);
    expect(() => parseBoardArgs(["--budget", "0"])).toThrow(/above 0/);
    expect(parseBoardArgs(["--budget", "90"]).budget).toBe(90);
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
