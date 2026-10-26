import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import {
  addedExports,
  clashes,
  definitionsOf,
  duplicateFailures,
  homeFailures,
  homeFor,
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

test("reads the exported names a diff adds, skipping tests, games and deleted files", () => {
  expect(addedExports(DIFF)).toEqual([{ name: "pickWeighted", file: "packages/core/src/world/scatterItems.ts" }]);
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

test("finds every definition of a name in this checkout with one git grep", () => {
  const found = definitionsOf(ROOT, ["findPath"]).map((definition) => definition.file).sort();
  expect(found).toEqual(["packages/core/src/nav/navGrid.ts", "packages/core/src/nav/navMesh.ts"]);
});

test("file names split into concept words", () => {
  expect(nameWords("packages/shell/src/camera/shake/CameraShakeApplier.tsx")).toEqual(["camera", "shake", "applier"]);
  expect(nameWords("packages/react/src/cameraShake.test.tsx")).toEqual(["camera", "shake"]);
});

test("a new file named for a concept with a folder in its layer must sit in that folder", () => {
  const tree = [
    "packages/react/src/camera/shake/cameraShake.tsx",
    "packages/react/src/notifications/notices.tsx",
    "packages/react/src/hudFrame.tsx",
    "packages/core/src/world/terrain.ts",
  ];
  const layers = layerFolders(tree);
  expect(homeFor("packages/react/src/cameraShakeMeter.tsx", layers)).toEqual({ concept: "camera", homes: ["packages/react/src/camera"] });
  expect(homeFor("packages/react/src/camera/cameraFollow.tsx", layers)).toBeNull();
  expect(homeFor("packages/react/src/camera/shake/shakeMeter.tsx", layers)).toBeNull();
  expect(homeFor("packages/react/src/shakeMeter.tsx", layers)).toEqual({ concept: "shake", homes: ["packages/react/src/camera/shake"] });
  expect(homeFor("packages/react/src/hudLanes.tsx", layers)).toBeNull();
  expect(homeFor("packages/react/src/notifications.ts", layers)).toBeNull();
  expect(homeFor("packages/react/src/camera/index.ts", layers)).toBeNull();
  // A concept folder only binds its own layer.
  expect(homeFor("packages/shell/src/cameraRig.tsx", layers)).toBeNull();
  const failures = homeFailures(["packages/react/src/notificationsBell.tsx", "packages/react/src/notifications/bell.tsx"], tree);
  expect(failures.map((failure) => failure.file)).toEqual(["packages/react/src/notificationsBell.tsx"]);
  expect(homeFailures(["packages/react/src/notificationsBell.tsx"], tree, () => true)).toEqual([]);
});
