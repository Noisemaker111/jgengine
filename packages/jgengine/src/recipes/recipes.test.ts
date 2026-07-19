import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RECIPES, getRecipe, recipeNames, renderRecipe, renderRecipeList } from "./index";

const SEED = ["combat-loop", "boss-telegraph", "loot", "quest", "coop-presence", "third-person-camera"];

const here = dirname(fileURLToPath(import.meta.url));

/** Walk up from the test dir until the reviewed export manifest is found (cwd-independent). */
function repoRoot(): string {
  let dir = here;
  for (;;) {
    if (existsSync(join(dir, "scripts", "export-manifest.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("could not locate scripts/export-manifest.json");
    dir = parent;
  }
}

const root = repoRoot();
const manifest = JSON.parse(readFileSync(join(root, "scripts", "export-manifest.json"), "utf8")) as Record<
  string,
  string[]
>;
const validSpecifiers = new Set<string>();
for (const [pkg, subpaths] of Object.entries(manifest)) {
  for (const sub of subpaths) validSpecifiers.add(sub === "." ? pkg : pkg + sub.replace(/^\./, ""));
}

const IMPORT_SPECIFIER = /(?:from|import)\s+["'](@jgengine\/[^"']+)["']/g;

describe("recipe catalog", () => {
  test("ships exactly the seed set, in order", () => {
    expect(recipeNames()).toEqual(SEED);
  });

  test("every recipe's printed code is byte-identical to its compiled snippet file", () => {
    // The snippet files are type-checked against the SDK by tsconfig.recipes.json, so
    // this equality is what makes the printed recipe the compiled recipe — it can't rot.
    for (const recipe of RECIPES) {
      const file = join(here, "snippets", `${recipe.name}.ts`);
      expect(readFileSync(file, "utf8")).toBe(recipe.code);
    }
  });

  test("every @jgengine import resolves to a published subpath", () => {
    for (const recipe of RECIPES) {
      for (const match of recipe.code.matchAll(IMPORT_SPECIFIER)) {
        const spec = match[1]!;
        expect({ recipe: recipe.name, spec, valid: validSpecifiers.has(spec) }).toEqual({
          recipe: recipe.name,
          spec,
          valid: true,
        });
      }
    }
  });

  test("no recipe references Games/* — snippets are self-contained", () => {
    for (const recipe of RECIPES) expect(recipe.code).not.toContain("Games/");
  });
});

describe("recipe helpers", () => {
  test("renderRecipe returns the code for a known name and null otherwise", () => {
    expect(renderRecipe("loot")).toBe(getRecipe("loot")!.code);
    expect(renderRecipe("does-not-exist")).toBeNull();
  });

  test("renderRecipeList lists every recipe name", () => {
    const listing = renderRecipeList();
    for (const name of SEED) expect(listing).toContain(name);
  });
});
