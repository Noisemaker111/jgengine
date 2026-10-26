import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  addedExports,
  clashes,
  definitionsOf,
  duplicateFailures,
  homeFailures,
  homeFor,
  insideTemplateLiteral,
  layerFolders,
  nameWords,
} from "./check-concept-homes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const DIFF = `diff --git a/packages/core/src/world/scatterItems.ts b/packages/core/src/world/scatterItems.ts
--- a/packages/core/src/world/scatterItems.ts
+++ b/packages/core/src/world/scatterItems.ts
@@ -96,0 +97 @@
+export function pickWeighted<T>(entries: readonly { value: T; weight: number }[], roll: number): T | null {
+  const unchanged = 1;
--- a/packages/core/src/world/scatterItems.test.ts
+++ b/packages/core/src/world/scatterItems.test.ts
+export const notCounted = 1;
--- a/games/odd-orbit/src/world.ts
+++ b/games/odd-orbit/src/world.ts
+export const world = {};
--- a/scripts/gone.ts
+++ /dev/null
`;

test("reads the exported names a diff adds, games included, skipping tests and deleted files", () => {
  expect(addedExports(DIFF)).toEqual([
    { name: "pickWeighted", file: "packages/core/src/world/scatterItems.ts" },
    { name: "world", file: "games/odd-orbit/src/world.ts" },
  ]);
});

test("a game export named like an engine export fails; two games may share a name; entry exports are the contract", () => {
  const engine = { name: "pathLength", file: "packages/core/src/world/roads.ts" };
  expect(clashes({ name: "pathLength", file: "games/beacon-bastion/src/game/world/layout.ts" }, engine)).toBe(true);
  expect(clashes({ name: "Hud", file: "games/fernwild/src/game/Hud.tsx" }, { name: "Hud", file: "games/hold-the-line/src/game/Hud.tsx" })).toBe(false);
  const place = { name: "world", file: "packages/core/src/world/place.ts" };
  expect(clashes({ name: "world", file: "games/fernwild/src/world.ts" }, place)).toBe(false);
  expect(clashes({ name: "world", file: "games/fernwild/src/game/spec.ts" }, place)).toBe(true);
  expect(clashes({ name: "isPopulated", file: "games/shared/assetStore.ts" }, { name: "isPopulated", file: "packages/assets/src/cli/pull.ts" })).toBe(true);
});

test("a second engine definition of a name fails; two scripts or two games may share one", () => {
  const added = { name: "pickWeighted", file: "packages/core/src/world/scatterItems.ts" };
  const everywhere = [added, { name: "pickWeighted", file: "packages/core/src/random/pick.ts" }];
  const failures = duplicateFailures([added], everywhere);
  expect(failures).toHaveLength(1);
  expect(failures[0]!.detail).toContain("packages/core/src/random/pick.ts");
  expect(clashes({ name: "devSavePlugin", file: "apps/dev/devSavePlugin.ts" }, { name: "devSavePlugin", file: "packages/node/src/devSavePlugin.ts" })).toBe(true);
  expect(clashes({ name: "parseArgs", file: "scripts/a.ts" }, { name: "parseArgs", file: "scripts/b.ts" })).toBe(false);
  expect(duplicateFailures([added], [added])).toEqual([]);
});

test("an export the branch committed and then renamed in the working tree is not a duplicate", () => {
  const committed = { name: "summarize", file: "scripts/load-check.ts" };
  const elsewhere = { name: "summarize", file: "packages/github/src/analytics.ts" };
  expect(duplicateFailures([committed], [elsewhere])).toEqual([]);
});

test("finds every definition of a name in this checkout with one git grep", () => {
  const found = definitionsOf(ROOT, ["smoothstep"]).map((definition) => definition.file).sort();
  expect(found).toEqual(["packages/core/src/anim/easing.ts", "packages/shell/src/camera/rigMath.ts"]);
});

test("file names split into concept words", () => {
  expect(nameWords("packages/shell/src/camera/shake/CameraShakeApplier.tsx")).toEqual(["camera", "shake", "applier"]);
  expect(nameWords("packages/react/src/cameraShake.test.tsx")).toEqual(["camera", "shake"]);
});

test("a new file named for a concept with a folder in its layer must sit in that folder", () => {
  const tree = [
    "packages/react/src/camera/shake/cameraShake.tsx",
    "packages/react/src/notifications/notices.tsx",
    "packages/react/src/hud/hudFrame.tsx",
    "packages/core/src/world/terrain.ts",
  ];
  const layers = layerFolders(tree);
  expect(homeFor("packages/react/src/cameraShakeMeter.tsx", layers)).toEqual({ concept: "camera", homes: ["packages/react/src/camera"] });
  expect(homeFor("packages/react/src/camera/cameraFollow.tsx", layers)).toBeNull();
  expect(homeFor("packages/react/src/camera/shake/shakeMeter.tsx", layers)).toBeNull();
  expect(homeFor("packages/react/src/shakeMeter.tsx", layers)).toEqual({ concept: "shake", homes: ["packages/react/src/camera/shake"] });
  expect(homeFor("packages/react/src/hud/hudLanes.tsx", layers)).toBeNull();
  expect(homeFor("packages/react/src/notifications.ts", layers)).toBeNull();
  expect(homeFor("packages/react/src/camera/index.ts", layers)).toBeNull();
  // A concept folder only binds its own layer.
  expect(homeFor("packages/shell/src/cameraRig.tsx", layers)).toBeNull();
  const failures = homeFailures(["packages/react/src/notificationsBell.tsx", "packages/react/src/notifications/bell.tsx"], tree);
  expect(failures.map((failure) => failure.file)).toEqual(["packages/react/src/notificationsBell.tsx"]);
  expect(homeFailures(["packages/react/src/notificationsBell.tsx"], tree, () => true)).toEqual([]);
});

test("a generator's template text is not a definition", () => {
  const source = ["const a = 1;", "const text = `", "export const generated = 1;", "`;", "export const real = 2;"].join("\n");
  expect(insideTemplateLiteral(source, 3)).toBe(true);
  expect(insideTemplateLiteral(source, 5)).toBe(false);
  expect(insideTemplateLiteral('const s = "\\`";\nexport const x = 1;', 2)).toBe(false);
});
