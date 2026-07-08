import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildRegistry } from "./build-registry";

type BuiltItem = {
  $schema: string;
  name: string;
  type: string;
  title: string;
  description: string;
  registryDependencies?: string[];
  files: { path: string; type: string; target: string; content: string }[];
};

describe("build-registry", () => {
  const outDir = mkdtempSync(join(tmpdir(), "jg-registry-"));
  const written = buildRegistry(outDir);
  const indexPath = join(outDir, "registry.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    name: string;
    items: { name: string }[];
  };
  const items = written
    .filter((path) => path !== indexPath)
    .map((path) => JSON.parse(readFileSync(path, "utf8")) as BuiltItem);
  rmSync(outDir, { recursive: true, force: true });

  test("emits the index plus every item", () => {
    expect(index.name).toBe("jgengine");
    expect(items.map((item) => item.name).sort()).toEqual(
      index.items.map((item) => item.name).sort(),
    );
  });

  test("every item is a valid registry item with inlined content", () => {
    for (const item of items) {
      expect(item.$schema).toBe("https://ui.shadcn.com/schema/registry-item.json");
      expect(item.type).toBe("registry:ui");
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.files.length).toBeGreaterThan(0);
      for (const file of item.files) {
        expect(file.target.startsWith("components/ui/")).toBe(true);
        expect(file.content.length).toBeGreaterThan(100);
      }
    }
  });

  test("registry dependencies resolve to absolute jgengine URLs", () => {
    const entityVitalBar = items.find((item) => item.name === "entity-vital-bar");
    expect(entityVitalBar?.registryDependencies).toEqual([
      "https://jgengine.com/r/vital-bar.json",
    ]);
    const abilitySlot = items.find((item) => item.name === "ability-slot");
    expect(abilitySlot?.registryDependencies).toEqual([
      "https://jgengine.com/r/keybind-badge.json",
    ]);
  });

  test("pilot components carry their engine hookup", () => {
    const entityVitalBar = items.find((item) => item.name === "entity-vital-bar");
    expect(entityVitalBar?.files[0]?.content).toContain(
      'import { useEntityStat } from "@jgengine/react/hooks"',
    );
    const gameIcon = items.find((item) => item.name === "game-icon");
    expect(gameIcon?.files[0]?.content).toContain("export function iconForItemId");
    expect(gameIcon?.files[0]?.content).toContain("export function iconForAction");
  });
});
