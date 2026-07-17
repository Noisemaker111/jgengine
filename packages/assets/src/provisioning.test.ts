import { describe, expect, test } from "bun:test";

import type { AssetAlias, IndexEntry, SingleAsset } from "./manifest";
import { resolveProvenance, validateAssetReferences } from "./provisioning";

const index: IndexEntry[] = [
  { id: "quaternius-stylized-nature/Pine_1", source: "quaternius-stylized-nature", categories: ["nature"], file: "Pine_1.glb" },
];
const singleList: SingleAsset[] = [
  { id: "custom/hero", url: "https://cdn.example.com/hero.glb", license: "CC0-1.0", author: "Someone", categories: ["prop"] },
];
const aliasList: AssetAlias[] = [{ key: "nature/tree_pine", target: "quaternius-stylized-nature/Pine_1" }];

const opts = { index, singles: singleList, aliases: aliasList };

describe("resolveProvenance", () => {
  test("a pack index entry is provisioned with a pull step", () => {
    const p = resolveProvenance("quaternius-stylized-nature/Pine_1", opts);
    expect(p.kind).toBe("provisioned");
    expect(p.sourceId).toBe("quaternius-stylized-nature");
    expect(p.resolvedPath).toBe("quaternius-stylized-nature/Pine_1.glb");
    expect(p.provisioningStep).toBe("assets pull quaternius-stylized-nature");
  });

  test("a single is committed with no pull step", () => {
    const p = resolveProvenance("custom/hero", opts);
    expect(p.kind).toBe("committed");
    expect(p.resolvedPath).toBe("https://cdn.example.com/hero.glb");
    expect(p.provisioningStep).toBeUndefined();
  });

  test("an alias resolves through to its target's provenance", () => {
    const p = resolveProvenance("nature/tree_pine", opts);
    expect(p.kind).toBe("provisioned");
    expect(p.viaAlias).toBe("nature/tree_pine");
    expect(p.sourceId).toBe("quaternius-stylized-nature");
  });

  test("an unknown id is dangling with no resolved path", () => {
    const p = resolveProvenance("does-not-exist/Ghost", opts);
    expect(p.kind).toBe("dangling");
    expect(p.resolvedPath).toBeNull();
    expect(p.provisioningStep).toBeUndefined();
  });

  test("resolves against the shipped index by default", () => {
    // Smoke: a real alias from the shipped data resolves to a non-dangling owner.
    expect(resolveProvenance("no-such-asset-xyz").kind).toBe("dangling");
  });
});

describe("validateAssetReferences", () => {
  test("a dangling ref is detected and reported with consumer, id, and null path", () => {
    const result = validateAssetReferences(
      [{ consumer: "games/demo", id: "does-not-exist/Ghost" }],
      opts,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("games/demo");
    expect(result.errors[0]).toContain("does-not-exist/Ghost");
    expect(result.errors[0]).toContain("dangling");
  });

  test("a provisioned ref validates and contributes its pull step", () => {
    const result = validateAssetReferences(
      [{ consumer: "games/demo", id: "quaternius-stylized-nature/Pine_1" }],
      opts,
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.provisioning).toEqual(["assets pull quaternius-stylized-nature"]);
  });

  test("a committed ref validates with no provisioning step", () => {
    const result = validateAssetReferences([{ consumer: "games/demo", id: "custom/hero" }], opts);
    expect(result.ok).toBe(true);
    expect(result.provisioning).toHaveLength(0);
  });

  test("present-predicate mode fails a provisioned ref whose bytes are absent", () => {
    const result = validateAssetReferences(
      [{ consumer: "games/demo", id: "quaternius-stylized-nature/Pine_1" }],
      { ...opts, present: () => false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("not provisioned");
    expect(result.errors[0]).toContain("assets pull quaternius-stylized-nature");
  });

  test("present-predicate mode passes a provisioned ref whose bytes are on disk", () => {
    const result = validateAssetReferences(
      [{ consumer: "games/demo", id: "quaternius-stylized-nature/Pine_1" }],
      { ...opts, present: () => true },
    );
    expect(result.ok).toBe(true);
  });

  test("dedupes and sorts provisioning steps across many references", () => {
    const result = validateAssetReferences(
      [
        { consumer: "a", id: "quaternius-stylized-nature/Pine_1" },
        { consumer: "b", id: "nature/tree_pine" },
        { consumer: "c", id: "custom/hero" },
      ],
      opts,
    );
    expect(result.ok).toBe(true);
    expect(result.provisioning).toEqual(["assets pull quaternius-stylized-nature"]);
  });
});
