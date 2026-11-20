import { describe, expect, test } from "bun:test";

import {
  auditManifest,
  classifyOwnership,
  collectOwnershipDiagnostics,
  isSceneOwnershipManifest,
  ownershipKey,
  SCENE_OWNERSHIP_MANIFEST_VERSION,
  type SceneOwnershipDeclaration,
  type SceneOwnershipManifest,
} from "./sceneOwnership";

describe("classifyOwnership", () => {
  test("authored content is exposed and editable", () => {
    const verdict = classifyOwnership({ provenance: { kind: "authored", documentId: "prop-42" } });
    expect(verdict.decision).toBe("expose");
    expect(verdict.readOnly).toBe(false);
    expect(verdict.bakeable).toBe(false);
    expect(verdict.violation).toBeUndefined();
    expect(verdict.reason).toContain("prop-42");
  });

  test("generated content is exposed read-only and points edits at its source", () => {
    const verdict = classifyOwnership({
      provenance: { kind: "generated", sourceDocumentId: "layer-grass", instanceId: "blade-7" },
    });
    expect(verdict.decision).toBe("expose");
    expect(verdict.readOnly).toBe(true);
    expect(verdict.bakeable).toBe(false);
    expect(verdict.reason).toContain("layer-grass");
    expect(verdict.violation).toBeUndefined();
  });

  test("runtime content with a bake capability is offered for import", () => {
    const verdict = classifyOwnership({
      provenance: { kind: "runtime", providerId: "town", instanceId: "building-3" },
      capabilities: { select: true, focus: true, bake: true },
    });
    expect(verdict.decision).toBe("bake");
    expect(verdict.bakeable).toBe(true);
    expect(verdict.readOnly).toBe(true);
    expect(verdict.violation).toBeUndefined();
  });

  test("runtime content with a reason but no bake is rejected as declared read-only", () => {
    const verdict = classifyOwnership({
      provenance: { kind: "runtime", providerId: "town", instanceId: "skybox" },
      reason: "procedural skybox has no authorable geometry",
    });
    expect(verdict.decision).toBe("reject");
    expect(verdict.readOnly).toBe(true);
    expect(verdict.bakeable).toBe(false);
    expect(verdict.violation).toBeUndefined();
    expect(verdict.reason).toBe("procedural skybox has no authorable geometry");
  });

  test("runtime content with neither bake nor reason is a boundary violation", () => {
    const verdict = classifyOwnership({
      provenance: { kind: "runtime", providerId: "town", instanceId: "building-9" },
    });
    expect(verdict.decision).toBe("reject");
    expect(verdict.violation).toBeDefined();
    expect(verdict.violation).toContain("bypasses the scene-ownership boundary");
  });

  test("a whitespace-only reason still counts as undeclared", () => {
    const verdict = classifyOwnership({
      provenance: { kind: "transient", providerId: "sim", instanceId: "guest-1" },
      reason: "   ",
    });
    expect(verdict.decision).toBe("reject");
    expect(verdict.violation).toBeDefined();
  });

  test("transient simulation content follows the runtime rules", () => {
    const verdict = classifyOwnership({
      provenance: { kind: "transient", providerId: "sim", instanceId: "guest-1" },
      reason: "spawned guest, never persisted",
    });
    expect(verdict.decision).toBe("reject");
    expect(verdict.provenance).toBe("transient");
    expect(verdict.violation).toBeUndefined();
  });
});

describe("ownershipKey", () => {
  test("keys are stable and provenance-specific", () => {
    expect(ownershipKey({ kind: "authored", documentId: "prop-1" })).toBe("authored:prop-1");
    expect(ownershipKey({ kind: "generated", sourceDocumentId: "layer", instanceId: "i-2" })).toBe(
      "generated:layer/i-2",
    );
    expect(ownershipKey({ kind: "runtime", providerId: "town", instanceId: "b-3" })).toBe("runtime:town/b-3");
    expect(ownershipKey({ kind: "transient", providerId: "sim", instanceId: "g-4" })).toBe("transient:sim/g-4");
  });
});

describe("collectOwnershipDiagnostics", () => {
  test("reports only violating entries, in iteration order", () => {
    const entries: Array<[string, SceneOwnershipDeclaration]> = [
      ["a", { provenance: { kind: "authored", documentId: "prop-1" } }],
      ["b", { provenance: { kind: "runtime", providerId: "p", instanceId: "x" } }],
      ["c", { provenance: { kind: "runtime", providerId: "p", instanceId: "y" }, reason: "ok" }],
      ["d", { provenance: { kind: "transient", providerId: "p", instanceId: "z" } }],
    ];
    const diagnostics = collectOwnershipDiagnostics(entries);
    expect(diagnostics.map((d) => d.key)).toEqual(["b", "d"]);
    expect(diagnostics[0]?.message).toContain("b:");
  });
});

describe("manifest serialization and audit", () => {
  const manifest: SceneOwnershipManifest = {
    version: SCENE_OWNERSHIP_MANIFEST_VERSION,
    provider: "town",
    declarations: [
      { provenance: { kind: "authored", documentId: "gate" } },
      {
        provenance: { kind: "runtime", providerId: "town", instanceId: "buildings" },
        capabilities: { select: true, bake: true },
      },
      {
        provenance: { kind: "runtime", providerId: "town", instanceId: "skybox" },
        reason: "procedural sky, no authorable geometry",
      },
    ],
  };

  test("a clean manifest round-trips through JSON and audits without violations", () => {
    const restored: unknown = JSON.parse(JSON.stringify(manifest));
    expect(isSceneOwnershipManifest(restored)).toBe(true);
    if (!isSceneOwnershipManifest(restored)) throw new Error("guard failed");
    expect(auditManifest(restored)).toEqual([]);
  });

  test("audit flags an undeclared runtime object", () => {
    const dirty: SceneOwnershipManifest = {
      version: SCENE_OWNERSHIP_MANIFEST_VERSION,
      declarations: [{ provenance: { kind: "runtime", providerId: "town", instanceId: "wall" } }],
    };
    const diagnostics = auditManifest(dirty);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.key).toBe("runtime:town/wall");
  });

  test("isSceneOwnershipManifest rejects malformed input", () => {
    expect(isSceneOwnershipManifest(null)).toBe(false);
    expect(isSceneOwnershipManifest({ version: 2, declarations: [] })).toBe(false);
    expect(isSceneOwnershipManifest({ version: 1, declarations: "nope" })).toBe(false);
    expect(
      isSceneOwnershipManifest({ version: 1, declarations: [{ provenance: { kind: "authored" } }] }),
    ).toBe(false);
    expect(
      isSceneOwnershipManifest({ version: 1, declarations: [{ provenance: { kind: "bogus" } }] }),
    ).toBe(false);
  });
});
