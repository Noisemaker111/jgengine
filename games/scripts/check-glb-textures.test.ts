import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkGlbTextures, inspectGlb, resolveTexture, type Io } from "./check-glb-textures";

/**
 * A GLB whose JSON chunk carries `images`. Only the JSON chunk is read, so the BIN chunk is empty.
 */
function glb(images: { uri?: string }[]): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, images }), "utf8");
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json]);
}

/** A game tree in a temp dir: `files` are written as-is, so the test owns what exists. */
function fixture(files: Record<string, Buffer | string>): string {
  const root = mkdtempSync(join(tmpdir(), "glb-textures-"));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

const io: Io = {
  readGlbJson: (path) => {
    const bytes = readFileSync(path);
    return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  },
  exists: existsSync,
};

describe("the rule a GLB texture reference has to satisfy", () => {
  test("a bundled GLB's relative texture is unresolvable, because its URL is hashed", () => {
    expect(resolveTexture("src/art/planter-far.glb", "Flowers.png")).toHaveProperty("reason");
  });

  test("a bundled GLB's served path resolves under public/", () => {
    expect(resolveTexture("src/art/planter-far.glb", "/models/pack/Flowers.png")).toEqual({ target: "models/pack/Flowers.png" });
  });

  test("a public GLB's relative texture is its sibling", () => {
    expect(resolveTexture("public/models/pack/Bush.glb", "Flowers.png")).toEqual({ target: "models/pack/Flowers.png" });
  });

  test("an embedded image is not a reference at all", () => {
    expect(inspectGlb(fixture({}), "g", "src/art/embedded.glb", { ...io, readGlbJson: () => ({ images: [{}, { uri: undefined }] }) }).problems).toEqual([]);
  });
});

describe("the check that fails when a game GLB names a texture the repo cannot serve", () => {
  // The exact defect the far planter shipped: a GLB copied out of a provisioned pack into src/art/
  // kept the pack's relative texture names, and nothing failed because the model itself loaded.
  test("fails on the far-planter shape: a bundled GLB naming a pack-relative texture", () => {
    const root = fixture({
      "game/src/art/planter-far.glb": glb([{ uri: "Leaves_NormalTree_C.png" }, { uri: "Flowers.png" }]),
      "game/public/models/pack/Leaves_NormalTree_C.png": "png",
      "game/public/models/pack/Flowers.png": "png",
    });
    const result = checkGlbTextures(root, ["game"], io);
    expect(result.problems.map((p) => p.texture)).toEqual(["Leaves_NormalTree_C.png", "Flowers.png"]);
    expect(result.lines.at(-1)).toContain("2 texture references cannot be served");
  });

  test("fails when a served path names a file the pack does not ship", () => {
    const root = fixture({ "game/src/art/planter-far.glb": glb([{ uri: "/models/pack/Missing.png" }]) });
    const result = checkGlbTextures(root, ["game"], io);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.reason).toContain("bun run games:provision game");
  });

  test("passes the fixed shape: the served path exists", () => {
    const root = fixture({
      "game/src/art/planter-far.glb": glb([{ uri: "/models/quaternius-stylized-nature/Flowers.png" }]),
      "game/public/models/quaternius-stylized-nature/Flowers.png": "png",
    });
    const result = checkGlbTextures(root, ["game"], io);
    expect(result.problems).toEqual([]);
    expect(result.textures).toBe(1);
    expect(result.lines.at(-1)).toContain("all resolve");
  });

  test("passes a provisioned pack GLB whose textures are its siblings", () => {
    const root = fixture({
      "game/public/models/pack/Bush.glb": glb([{ uri: "Flowers.png" }]),
      "game/public/models/pack/Flowers.png": "png",
    });
    expect(checkGlbTextures(root, ["game"], io).problems).toEqual([]);
  });

  test("a texture-less GLB is checked, not skipped", () => {
    const root = fixture({ "game/src/art/plain.glb": glb([]) });
    const result = checkGlbTextures(root, ["game"], io);
    expect(result.glbs).toBe(1);
    expect(result.textures).toBe(0);
    expect(result.problems).toEqual([]);
  });
});
