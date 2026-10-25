import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { diffFrames, findBaseline, gameTreeHash, parseProveArgs, proofKey, runProve, summarise, type CodeState, type Manifest } from "./prove";

function frame(width: number, height: number, fill: number): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "prove-"));
}

const code: CodeState = { hash: "game-tree", head: "abc123", dirty: false, engineCommit: "eng123", tools: "tools1", servedDir: "/games/harbor-heat" };

const args = {
  game: "harbor-heat",
  views: ["boulevard"],
  sizes: [{ width: 1600, height: 900, label: "1600x900" }],
  tier: "high",
  params: [],
  refresh: false,
  keepGoing: false,
};

/** A capture that writes a real PNG-shaped file and counts how often it ran. */
function fakeShoot(counter: { runs: number }, pixels: (view: string) => number) {
  return (request: { view: string; size: { width: number; height: number }; out: string }) => {
    counter.runs += 1;
    mkdirSync(dirname(request.out), { recursive: true });
    writeFileSync(request.out, `png:${request.view}:${request.size.width}:${pixels(request.view)}`);
    return { png: request.out, camera: "@marker:player_spawn", sha: `sha-${pixels(request.view)}`, seconds: 0.1 };
  };
}

describe("parseProveArgs", () => {
  test("reads views, sizes, tier and flow", () => {
    const parsed = parseProveArgs(["harbor-heat", "--view", "boulevard", "--view", "downtown", "--sizes", "1600x900,1024x640", "--flow", "to-chase", "--state", "chase", "--tier", "ultra"]);
    expect(parsed.views).toEqual(["boulevard", "downtown"]);
    expect(parsed.sizes.map((size) => size.label)).toEqual(["1600x900", "1024x640"]);
    expect(parsed.tier).toBe("ultra");
    expect(parsed.flow).toBe("to-chase");
    expect(parsed.flowState).toBe("chase");
  });

  test("refuses a proof with no named framing, a bad size or an unknown tier", () => {
    expect(() => parseProveArgs(["harbor-heat"])).toThrow(/--view/);
    expect(() => parseProveArgs(["harbor-heat", "--view", "x", "--sizes", "big"])).toThrow(/WxH/);
    expect(() => parseProveArgs(["harbor-heat", "--view", "x", "--tier", "extreme"])).toThrow(/must be one of low, medium, high, ultra \(got extreme\)/);
  });
});

describe("proofKey", () => {
  const base = { gameTree: "t1", engineCommit: "e1", tools: "x1", view: "boulevard", size: "1600x900", tier: "high", params: [] as string[] };

  test("changes when any input that changes the pixels changes", () => {
    const key = proofKey(base);
    expect(proofKey({ ...base, gameTree: "t2" })).not.toBe(key);
    expect(proofKey({ ...base, engineCommit: "e2" })).not.toBe(key);
    expect(proofKey({ ...base, tools: "x2" })).not.toBe(key);
    expect(proofKey({ ...base, view: "downtown" })).not.toBe(key);
    expect(proofKey({ ...base, size: "1024x640" })).not.toBe(key);
    expect(proofKey({ ...base, tier: "ultra" })).not.toBe(key);
    expect(proofKey({ ...base, params: ["seed=7"] })).not.toBe(key);
  });

  test("holds still for reordered params", () => {
    expect(proofKey({ ...base, params: ["b=2", "a=1"] })).toBe(proofKey({ ...base, params: ["a=1", "b=2"] }));
  });
});

describe("gameTreeHash", () => {
  test("changes for an uncommitted edit inside the game and not for one outside it", () => {
    const repo = scratch();
    mkdirSync(join(repo, "harbor-heat", "src"), { recursive: true });
    mkdirSync(join(repo, "deepward", "src"), { recursive: true });
    writeFileSync(join(repo, "harbor-heat", "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(repo, "deepward", "src", "a.ts"), "export const a = 1;\n");
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    Bun.spawnSync(["git", "add", "-A"], { cwd: repo });
    Bun.spawnSync(["git", "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "one"], { cwd: repo });
    const clean = gameTreeHash(repo, "harbor-heat");
    expect(clean.dirty).toBe(false);

    writeFileSync(join(repo, "deepward", "src", "a.ts"), "export const a = 2;\n");
    expect(gameTreeHash(repo, "harbor-heat").hash).toBe(clean.hash);

    writeFileSync(join(repo, "harbor-heat", "src", "a.ts"), "export const a = 3;\n");
    const dirty = gameTreeHash(repo, "harbor-heat");
    expect(dirty.dirty).toBe(true);
    expect(dirty.hash).not.toBe(clean.hash);

    writeFileSync(join(repo, "harbor-heat", "src", "new.ts"), "export const b = 1;\n");
    expect(gameTreeHash(repo, "harbor-heat").hash).not.toBe(dirty.hash);
  });

  test("ignores evidence another lane left in docs/", () => {
    const repo = scratch();
    mkdirSync(join(repo, "harbor-heat", "docs"), { recursive: true });
    mkdirSync(join(repo, "harbor-heat", "src"), { recursive: true });
    writeFileSync(join(repo, "harbor-heat", "src", "a.ts"), "export const a = 1;\n");
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    Bun.spawnSync(["git", "add", "-A"], { cwd: repo });
    Bun.spawnSync(["git", "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "one"], { cwd: repo });
    const clean = gameTreeHash(repo, "harbor-heat");
    writeFileSync(join(repo, "harbor-heat", "docs", "shot.png"), "not a png");
    writeFileSync(join(repo, "harbor-heat", "docs", "shot.shot.json"), "{}");
    expect(gameTreeHash(repo, "harbor-heat").hash).toBe(clean.hash);
  });
});

describe("diffFrames", () => {
  test("reports no difference for the same frame and full share for a black/white pair", () => {
    expect(diffFrames(frame(4, 2, 10), frame(4, 2, 10))).toEqual({ meanAbs: 0, over8Share: 0, pixels: 8 });
    const changed = diffFrames(frame(4, 2, 0), frame(4, 2, 255));
    expect(changed.meanAbs).toBe(255);
    expect(changed.over8Share).toBe(1);
  });

  test("measures a small change below the visible threshold", () => {
    const result = diffFrames(frame(2, 2, 100), frame(2, 2, 104));
    expect(result.meanAbs).toBe(4);
    expect(result.over8Share).toBe(0);
  });
});

describe("runProve cache", () => {
  const deps = (counter: { runs: number }, pixels: (view: string) => number) => ({
    shoot: fakeShoot(counter, pixels) as never,
    drive: () => ({ ok: true, wallMs: 1, output: "" }),
    diff: (a: string, b: string) => {
      const first = readFileSync(a, "utf8").split(":").pop();
      const second = readFileSync(b, "utf8").split(":").pop();
      const same = first === second;
      return { meanAbs: same ? 0.5 : 2, over8Share: same ? 0.001 : 0.01, pixels: 100 };
    },
    now: () => 0,
    rereadServedTree: () => code.hash,
  });

  test("captures once, then reuses the identical input and reports it", () => {
    const root = scratch();
    const counter = { runs: 0 };
    const first = runProve(args, deps(counter, () => 1), { bundleRoot: root, code });
    expect(counter.runs).toBe(2);
    expect(first.manifest.artefacts[0]!.reused).toBe(false);

    const second = runProve(args, deps(counter, () => 1), { bundleRoot: root, code });
    expect(counter.runs).toBe(2);
    expect(second.manifest.artefacts[0]!.reused).toBe(true);
    expect(second.manifest.artefacts[0]!.control).toEqual(first.manifest.artefacts[0]!.control);
  });

  test("re-runs when the code state changes", () => {
    const root = scratch();
    const counter = { runs: 0 };
    runProve(args, deps(counter, () => 1), { bundleRoot: root, code });
    expect(counter.runs).toBe(2);

    const changed = runProve(args, deps(counter, () => 1), { bundleRoot: root, code: { ...code, hash: "other-tree" } });
    expect(counter.runs).toBe(4);
    expect(changed.manifest.artefacts[0]!.reused).toBe(false);
  });

  test("a later run diffs against the earlier code state and keeps the noise floor apart", () => {
    const root = scratch();
    const counter = { runs: 0 };
    const first = runProve(args, deps(counter, () => 1), { bundleRoot: root, code });
    const second = runProve(args, deps(counter, () => 2), { bundleRoot: root, code: { ...code, hash: "later-tree" } });
    expect(first.manifest.artefacts[0]!.state.taken).toBe(false);
    const state = second.manifest.artefacts[0]!.state;
    if (!state.taken) throw new Error("expected a state diff");
    expect(state.meanAbs).toBe(2);
    expect(state.over8Share).toBe(0.01);
    expect(state.aboveNoise).toBe(2 - second.manifest.artefacts[0]!.control.meanAbs);
    expect(findBaseline(root, { view: "boulevard", size: "1600x900", tier: "high", key: "nope" })).not.toBeNull();
  });

  test("a refused capture fails the bundle with its reason instead of a blank artefact", () => {
    const root = scratch();
    const refusal = {
      shoot: () => {
        throw new Error("the frame is flat - no 3D canvas committed");
      },
      drive: () => ({ ok: true, wallMs: 1, output: "" }),
      diff: () => ({ meanAbs: 0, over8Share: 0, pixels: 1 }),
      now: () => 0,
      rereadServedTree: () => code.hash,
    };
    const result = runProve({ ...args, views: ["boulevard", "downtown"], keepGoing: true }, refusal, { bundleRoot: root, code });
    expect(result.manifest.ok).toBe(false);
    expect(result.manifest.artefacts).toHaveLength(0);
    expect(result.manifest.failures[0]).toContain("flat - no 3D canvas");
    expect(readManifest(result.manifestPath).failures).toHaveLength(2);
  });

  test("a served tree that is not the tree under test fails the bundle and names both hashes", () => {
    const root = scratch();
    const counter = { runs: 0 };
    const drifted = { ...deps(counter, () => 1), rereadServedTree: () => "another-tree" };
    const result = runProve(args, drifted, { bundleRoot: root, code });
    expect(result.manifest.ok).toBe(false);
    expect(result.manifest.code.servedTree).toBe("another-tree");
    expect(result.manifest.code.gameTree).toBe("game-tree");
    expect(result.manifest.code.servedDir).toBe("/games/harbor-heat");
    const failure = result.manifest.failures.join("\n");
    expect(failure).toContain("another-tree");
    expect(failure).toContain("game-tree");
    expect(failure).toContain("not the tree under test");
  });
});

describe("summarise", () => {
  test("names the noise floor, the state numbers and the flow verdict", () => {
    const manifest: Manifest = {
      v: 1,
      game: "harbor-heat",
      capturedAt: "2026-10-24T00:00:00.000Z",
      code: { gameTree: "abcdef1234567890", head: "h", dirty: false, engineCommit: "e", tools: "t", servedDir: "/games/harbor-heat", servedTree: "abcdef1234567890" },
      sizes: ["1600x900"],
      views: ["boulevard"],
      tier: "high",
      artefacts: [
        {
          view: "boulevard",
          size: "1600x900",
          tier: "high",
          key: "k",
          png: "a.png",
          controlPng: "b.png",
          sha: "1",
          controlSha: "2",
          camera: null,
          control: { meanAbs: 0.42, over8Share: 0.002, pixels: 100 },
          state: { taken: true, baseline: "m.json", baselineKey: "old", meanAbs: 1.5, over8Share: 0.03, pixels: 100, aboveNoise: 1.08 },
          reused: false,
          seconds: 1,
        },
      ],
      flow: null,
      failures: [],
      seconds: 12,
      ok: true,
    };
    const text = summarise(manifest);
    expect(text).toContain("noise 0.42 mean-abs, 0.20% >8");
    expect(text).toContain("state 1.50 mean-abs, 3.00% >8 (+1.08 over noise)");
    expect(text).toContain("12s wall, provable");
  });
});

function readManifest(path: string): Manifest {
  return JSON.parse(require("node:fs").readFileSync(path, "utf8")) as Manifest;
}
