import { describe, expect, test } from "bun:test";

import { checkPublishOrder, checkReleaseSet, lockstepSetFrom, publishListsFrom, versionPackagesFrom } from "./check-release-set";

describe("check-release-set", () => {
  const manifests = new Map([
    ["core", { name: "@jgengine/core" }],
    ["navbake", { name: "@jgengine/navbake", dependencies: { "@jgengine/core": "^0.18.0" } }],
    ["editor", { name: "@jgengine/editor", dependencies: { "@jgengine/core": "^0.18.0", "@jgengine/navbake": "^0.18.0" } }],
  ]);

  test("flags a dependency that is not published", () => {
    expect(checkPublishOrder(["core", "editor"], manifests)).toEqual([
      "@jgengine/editor depends on @jgengine/navbake (packages/navbake), which is not in the publish list — consumers cannot install it",
    ]);
  });

  test("flags a dependency published after its dependent", () => {
    expect(checkPublishOrder(["core", "editor", "navbake"], manifests)).toEqual(["@jgengine/navbake must publish before @jgengine/editor; it is listed after"]);
  });

  test("passes a complete order", () => {
    expect(checkPublishOrder(["core", "navbake", "editor"], manifests)).toEqual([]);
  });

  test("parses the three list sources", () => {
    expect(publishListsFrom('for p in core navbake; do\nfor p in core navbake; do')).toEqual([["core", "navbake"], ["core", "navbake"]]);
    expect(versionPackagesFrom('const PACKAGES = ["core", "navbake"];')).toEqual(["core", "navbake"]);
    expect(lockstepSetFrom("`@jgengine/{core,navbake}`")).toEqual(["core", "navbake"]);
  });

  test("the repository's own lists agree", () => {
    expect(checkReleaseSet().failures).toEqual([]);
  });
});
