import { expect, test } from "bun:test";

import { DEFAULT_SKILL, importedFolders, routeFolders } from "./gen-skill-routing";
import { CORE_DOMAIN_SKILLS, skillForModule } from "./skillRouting";

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

test("a new folder takes the skill most of its neighbours carry; routed folders keep theirs", () => {
  const existing = { loot: "jgengine-gameplay", inventory: "jgengine-gameplay", sky: "jgengine-world", hud: "jgengine-ui" };
  const imports = new Map<string, string[]>([
    ["airdrop", ["loot", "inventory", "sky"]],
    ["beam", ["sky"]],
    ["loot", ["inventory"]],
    ["sky", []],
    ["hud", ["beam"]],
    ["inventory", []],
    ["chain", ["airdrop"]],
    ["lonely", []],
  ]);
  const routed = routeFolders([...imports.keys()], existing, imports);
  expect(routed).toEqual({
    airdrop: "jgengine-gameplay",
    beam: "jgengine-world",
    chain: "jgengine-gameplay",
    hud: "jgengine-ui",
    inventory: "jgengine-gameplay",
    lonely: DEFAULT_SKILL,
    loot: "jgengine-gameplay",
    sky: "jgengine-world",
  });
});

test("a folder that is gone leaves the routing", () => {
  expect(routeFolders(["loot"], { loot: "jgengine-gameplay", removed: "jgengine-world" }, new Map())).toEqual({ loot: "jgengine-gameplay" });
});

test("every routed core folder resolves to a skill", () => {
  for (const folder of Object.keys(CORE_DOMAIN_SKILLS)) expect(skillForModule("core", `${folder}/x`)).toBe(CORE_DOMAIN_SKILLS[folder]!);
});
