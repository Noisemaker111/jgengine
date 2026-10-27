import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SKILL_TAG, importedFolders, readProfiles, routeProfiles, writeTag } from "./gen-skill-routing";
import { CORE_DOMAIN_SKILLS, skillForModule } from "./skillRouting";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A core `src/` under `.scratch`: `files` maps a path under it to its contents. */
function coreSrc(files: Record<string, string>): string {
  const src = join(import.meta.dir, "..", ".scratch", `routing-${crypto.randomUUID()}`);
  made.push(src);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(src, path, ".."), { recursive: true });
    writeFileSync(join(src, path), contents);
  }
  return src;
}

const KNOWN = new Set(["jgengine", "jgengine-gameplay", "jgengine-world", "jgengine-ui"]);
const DOCS = new Map([
  ["jgengine-gameplay", ["loot", "inventory", "items", "drops"]],
  ["jgengine-world", ["sky", "terrain", "weather", "sun"]],
  ["jgengine-ui", ["hud", "panel", "menu"]],
]);

test("reads the core folders a file imports at its depth", () => {
  const source = [
    'import { a } from "../loot/lootTable";',
    'import type { B } from "../../scene/riding";',
    'import { c } from "@jgengine/core/random/rng";',
    'import { d } from "./sibling";',
    'import * as THREE from "three";',
    'const e = await import("../inventory/bag");',
  ].join("\n");
  expect(importedFolders(source, 1).sort()).toEqual(["inventory", "loot", "random"]);
  expect(importedFolders(source, 2).sort()).toEqual(["random", "scene"]);
});

test("the tag is one line, as a comment or inside a doc comment", () => {
  expect(SKILL_TAG.exec("// @skill jgengine-world\nexport {};")?.[1]).toBe("jgengine-world");
  expect(SKILL_TAG.exec("/**\n * Loot.\n * @skill jgengine-gameplay\n */")?.[1]).toBe("jgengine-gameplay");
  expect(SKILL_TAG.exec("// the @skill tag goes here")).toBeNull();
});

test("a tagged folder routes to its tag, wherever in the folder the tag is", () => {
  const src = coreSrc({
    "loot/lootTable.ts": "// @skill jgengine-gameplay\nexport function rollLoot() {}\n",
    "sky/deep/sun.ts": "/** @skill jgengine-world */\nexport const sun = 1;\n",
    "gameplay.ts": "// @skill jgengine-gameplay\nexport * from './loot/lootTable';\n",
    "untagged.ts": "export const barrel = 1;\n",
  });
  const { domains, guessed } = routeProfiles(readProfiles(src), KNOWN, DOCS);
  expect(domains).toEqual({ gameplay: "jgengine-gameplay", loot: "jgengine-gameplay", sky: "jgengine-world" });
  expect(guessed).toEqual([]);
});

test("proof: a new folder with no tag gets a guess from how its code reads, written into the folder", () => {
  const src = coreSrc({
    "loot/lootTable.ts": "// @skill jgengine-gameplay\n/** Roll loot drops into an inventory. */\nexport function rollLootDrops() {}\n",
    "sky/sun.ts": "// @skill jgengine-world\n/** The sun crosses the sky. */\nexport const sunPath = 1;\n",
    "weather/weather.ts": "/** Rain and snow fall from the sky over the terrain. */\nexport function weatherSky() {}\n",
  });
  const { domains, guessed } = routeProfiles(readProfiles(src), KNOWN, DOCS);
  expect(domains["weather"]).toBe("jgengine-world");
  expect(guessed.map((entry) => entry.profile.name)).toEqual(["weather"]);
  writeTag(guessed[0]!.profile.tagTarget, guessed[0]!.skill);
  expect(readFileSync(join(src, "weather", "weather.ts"), "utf8").split("\n")[0]).toBe("// @skill jgengine-world");
  expect(routeProfiles(readProfiles(src), KNOWN, DOCS).guessed).toEqual([]);
});

test("two different tags in one folder, or a tag naming no skill, is refused", () => {
  const twice = coreSrc({ "loot/a.ts": "// @skill jgengine-gameplay\n", "loot/b.ts": "// @skill jgengine-ui\n" });
  expect(() => routeProfiles(readProfiles(twice), KNOWN, DOCS)).toThrow("more than one @skill tag");
  const unknown = coreSrc({ "loot/a.ts": "// @skill jgengine-loot\n" });
  expect(() => routeProfiles(readProfiles(unknown), KNOWN, DOCS)).toThrow("is not a skill");
});

test("every routed core folder resolves to a skill", () => {
  for (const folder of Object.keys(CORE_DOMAIN_SKILLS)) expect(skillForModule("core", `${folder}/x`)).toBe(CORE_DOMAIN_SKILLS[folder]!);
});
