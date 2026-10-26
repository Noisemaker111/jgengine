import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { declaredExport, engineRoot, layerOf, listRepoFiles, locate, readExports, renderLocations, type CodeFile } from "./codeMap";
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

test("a concept folder wins its layer, and stray pieces are listed outside it", () => {
  const sources: Record<string, string> = {
    "packages/react/src/camera/shake/cameraShake.tsx": "/** Meter. */\nexport function CameraShakeMeter() {}\n",
    "packages/react/src/camera/shake/readout.ts": "export function useCameraShakeReadout() {}\n",
    "packages/react/src/hudFrame.tsx": "/** Mentions camera shake in passing. */\nexport function HudFrame() {}\n",
    "packages/react/src/stray.tsx": "export function CameraShakeLabel() {}\n",
    "packages/core/src/world/notes.ts": "/** Shakes nothing about the camera. */\nexport const unrelated = 1;\n",
  };
  const files = Object.keys(sources).map((path) => layerOf(path)!);
  const homes = locate(files, (file: CodeFile) => sources[file.path]!, queryTokens("camera shake"));
  expect(homes.map((home) => [home.layer, home.home])).toEqual([["react", "packages/react/src/camera/shake/"]]);
  expect(homes[0]!.role).toBe("view");
  expect(homes[0]!.files.map((hit) => hit.path)).toEqual(["packages/react/src/camera/shake/cameraShake.tsx", "packages/react/src/camera/shake/readout.ts"]);
  expect(homes[0]!.elsewhere.map((hit) => hit.path)).toEqual(["packages/react/src/stray.tsx"]);
  const text = renderLocations(homes).join("\n");
  expect(text).toContain("react (view)     packages/react/src/camera/shake/");
  expect(text).toContain("also packages/react/src/stray.tsx  CameraShakeLabel");
});

describe("this checkout answers where a concept lives in one call", () => {
  const root = engineRoot(import.meta.dir)!;
  const files = listRepoFiles(root);
  const read = (file: CodeFile) => readFileSync(join(root, file.path), "utf8");
  const homeOf = (query: string) => new Map(locate(files, read, queryTokens(query)).map((home) => [home.layer, home.home]));

  test("camera shake: one folder per layer", () => {
    const homes = homeOf("camera shake");
    expect(homes.get("core")).toBe("packages/core/src/camera/shake/");
    expect(homes.get("shell")).toBe("packages/shell/src/camera/shake/");
    expect(homes.get("react")).toBe("packages/react/src/camera/shake/");
  });

  test("haptics and notifications have one home per layer", () => {
    const haptics = homeOf("haptics");
    expect(haptics.get("core")).toBe("packages/core/src/haptics/");
    expect(haptics.get("shell")).toBe("packages/shell/src/haptics/");
    const notifications = homeOf("notifications");
    expect(notifications.get("core")).toBe("packages/core/src/notifications/");
    expect(notifications.get("shell")).toBe("packages/shell/src/notifications/");
    expect(notifications.get("react")).toBe("packages/react/src/notifications/");
  });

  test("grass and hud point at the folders that hold them", () => {
    const grass = homeOf("grass");
    expect(grass.get("core")).toBe("packages/core/src/world/");
    expect(grass.get("shell")).toBe("packages/shell/src/terrain/");
    const hud = homeOf("hud");
    expect(hud.get("core")).toBe("packages/core/src/ui/");
    expect(hud.get("react")).toBe("packages/react/src/");
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
