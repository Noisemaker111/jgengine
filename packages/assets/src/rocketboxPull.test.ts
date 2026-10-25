import { describe, expect, test } from "bun:test";

import { MODEL_LIBRARY } from "./catalogs/modelLibrary";
import { pullRocketboxModel, ROCKETBOX_COMMIT } from "./rocketboxPull";

describe("Rocketbox pull", () => {
  test("reads from one pinned upstream commit", () => {
    expect(ROCKETBOX_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  test("refuses entries from another provider and listings served by another host", async () => {
    const lamp = MODEL_LIBRARY.find((entry) => entry.origin.provider === "polyhaven")!;
    await expect(pullRocketboxModel(lamp, { modelsRoot: "unused" })).rejects.toThrow("not a Rocketbox");
    const human = MODEL_LIBRARY.find((entry) => entry.origin.provider === "rocketbox")!;
    const listing = [{ name: "x.fbx", path: "x.fbx", sha: "0", size: 1, type: "file", download_url: "https://example.com/x.fbx" }];
    const fetchImpl = (async () => new Response(JSON.stringify(listing))) as unknown as typeof fetch;
    await expect(pullRocketboxModel(human, { modelsRoot: "unused", fetchImpl })).rejects.toThrow();
  });
});
