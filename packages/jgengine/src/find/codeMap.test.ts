import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { declaredExport, engineRoot, indexCode, layerOf, listRepoFiles, locate, locateIn, readExports, renderLocations, type CodeFile } from "./codeMap";
import { runFind } from "./runFind";
import { queryTokens } from "./words";

describe("reading exports", () => {
  test("names every declaration form and skips re-exports", () => {
    expect(declaredExport("export function pickWeighted<T>(rng: () => number) {")).toBe("pickWeighted");
    expect(declaredExport("export declare const DEFAULT: number;")).toBe("DEFAULT");
    expect(declaredExport("export default async function boot() {}")).toBe("boot");
    expect(declaredExport("export abstract class Base {}")).toBe("Base");
    expect(declaredExport('export { a, b } from "./x";')).toBeNull();
    expect(declaredExport("const local = 1;")).toBeNull();
  });

  test("keeps the first doc lines and drops tags", () => {
    const text = [
      "/**",
      " * Add camera trauma from anywhere.",
      " * @capability camera-shake add trauma",
      " */",
      "export function cameraShake(amount: number): void {}",
      "",
      "export const bare = 1;",
    ].join("\n");
    expect(readExports(text)).toEqual([
      { name: "cameraShake", line: 5, doc: "Add camera trauma from anywhere." },
      { name: "bare", line: 7 },
    ]);
  });
});

test("places repository paths in their layer and leaves tests and fixtures out", () => {
  expect(layerOf("packages/core/src/camera/shake/cameraShake.ts")).toEqual({ layer: "core", path: "packages/core/src/camera/shake/cameraShake.ts", rel: "camera/shake/cameraShake.ts" });
  expect(layerOf("apps/dev/src/demo/hudDemo.tsx")?.layer).toBe("apps/dev");
  expect(layerOf("scripts/check-concept-homes.ts")?.layer).toBe("scripts");
  expect(layerOf("packages/core/src/camera/shake/cameraShake.test.ts")).toBeNull();
  expect(layerOf("packages/core/src/meta/changelog.json")).toBeNull();
  expect(layerOf("games/odd-orbit/src/world.ts")).toBeNull();
});

test("a concept folder wins its layer, files named for it elsewhere are listed, and an export that only mentions it is not a home", () => {
  const sources: Record<string, string> = {
    "packages/react/src/camera/shake/cameraShake.tsx": "/** Meter. */\nexport function CameraShakeMeter() {}\n",
    "packages/react/src/camera/shake/readout.ts": "export function useCameraShakeReadout() {}\n",
    "packages/core/src/hud/hudFrame.view.tsx": "/** Mentions camera shake in passing. */\nexport function HudFrame() {}\n",
    "packages/react/src/cameraShakeLabel.tsx": "export function CameraShakeLabel() {}\n",
    "packages/shell/src/water/ocean.ts": "export const MAX_CAMERA_SHAKE_WAVES = 4;\n",
    "packages/core/src/world/notes.ts": "/** Shakes nothing about the camera. */\nexport const unrelated = 1;\n",
  };
  const files = Object.keys(sources).map((path) => layerOf(path)!);
  const homes = locate(files, (file: CodeFile) => sources[file.path]!, queryTokens("camera shake"));
  expect(homes.map((home) => [home.layer, home.home])).toEqual([["react", "packages/react/src/camera/shake/"]]);
  expect(homes[0]!.role).toBe("view");
  expect(homes[0]!.files.map((hit) => hit.path)).toEqual(["packages/react/src/camera/shake/cameraShake.tsx", "packages/react/src/camera/shake/readout.ts"]);
  expect(homes[0]!.elsewhere.map((hit) => hit.path)).toEqual(["packages/react/src/cameraShakeLabel.tsx"]);
  const text = renderLocations(homes).join("\n");
  expect(text).toContain("react (view)                packages/react/src/camera/shake/");
  expect(text).toContain("also packages/react/src/cameraShakeLabel.tsx  CameraShakeLabel");
});

describe("this checkout answers where a concept lives in one call", () => {
  const root = engineRoot(import.meta.dir)!;
  const files = listRepoFiles(root);
  // One index for the whole checkout: every query below matches against it, as `find` does for one.
  const index = indexCode(files, (file: CodeFile) => readFileSync(join(root, file.path), "utf8"));
  const homeOf = (query: string) => new Map(locateIn(index, queryTokens(query)).map((home) => [home.layer, home.home]));

  test("a moved world feature answers with its one feature folder", () => {
    for (const folder of ["grass", "sky", "water", "weather", "terrain", "instancing", "scatter", "lod", "environment", "map", "roads", "city"]) {
      const homes = homeOf(folder);
      expect(homes.get("core")).toBe(`packages/core/src/${folder}/`);
      expect(homes.get("shell") ?? "").not.toEndWith(`/${folder}/`);
    }
  });

  test("a moved feature answers with its one feature folder", () => {
    const features: [string, string][] = [
      ["hud", "hud"],
      ["save", "save"],
      ["camera shake", "camera/shake"],
      ["haptics", "haptics"],
      ["notifications", "notifications"],
      ["menu", "menu"],
      ["settings", "settings"],
      ["inventory", "inventory"],
      ["achievements", "achievements"],
      ["codex", "codex"],
      ["dialogue", "dialogue"],
      ["chat", "chat"],
      ["talents", "talents"],
      ["leaderboard", "leaderboard"],
      ["cutscene", "cutscene"],
      ["damage direction", "combat/damage"],
      ["ui kit", "ui/kit"],
      ["audio", "audio"],
      ["devtools", "devtools"],
      ["input", "input"],
      ["replay", "replay"],
      ["play script", "play"],
      ["placement", "placement"],
      ["multiplayer", "multiplayer"],
      ["behaviour", "behaviour"],
      ["commands", "commands"],
      ["buildings", "buildings"],
    ];
    for (const [query, folder] of features) {
      const homes = homeOf(query);
      expect(homes.get("core")).toBe(`packages/core/src/${folder}/`);
      expect(homes.get("shell") ?? "").not.toEndWith(`/${folder}/`);
      expect(homes.get("react") ?? "").not.toEndWith(`/${folder}/`);
    }
  });

  test("a feature name is not matched inside an unrelated export", () => {
    for (const query of ["waves"]) {
      const homes = homeOf(query);
      expect(homes.get("core")).toBe(`packages/core/src/${query}/`);
      expect(homes.has("shell")).toBe(false);
    }
  });
});

test("--text, or any content-search flag, runs the plain search", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(await runFind(["--text", "export async function runFind", "--in", import.meta.dir])).toBe(0);
    expect(log.mock.calls.map((call) => String(call[0]))).toContain(`runFind.ts:${runFindLine()}:export async function runFind(argv: string[]): Promise<number> {`);
    expect(await runFind(["zz" + "qx-gone", "--in", import.meta.dir, "--kind", "ts"])).toBe(1);
  } finally {
    log.mockRestore();
  }
});

function runFindLine(): number {
  return readFileSync(join(import.meta.dir, "runFind.ts"), "utf8").split("\n").findIndex((line) => line.startsWith("export async function runFind")) + 1;
}
