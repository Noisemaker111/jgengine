import { expect, test } from "bun:test";

import { apiNoteBullets, engineSeamLine, noteEntries, renderChangeNote } from "./change-note";

test("a prefix picks the heading, case-insensitively; a bare message is Changed; PR-only lines stay out", () => {
  const { sections, prOnly } = noteEntries([
    "Packs hunt",
    "fixed: dens hold",
    "Migrate: `den` is `denFor`",
    " ",
    "Closes #12",
    "Prevention: none - a tuning number",
  ]);
  expect([...sections]).toEqual([
    ["Changed", ["- Packs hunt"]],
    ["Fixed", ["- dens hold"]],
    ["Migrate", ["- `den` is `denFor`"]],
  ]);
  expect(prOnly).toEqual(["Closes #12", "Prevention: none - a tuning number"]);
});

test("the seam line names engine source beside a game change, none for game-only, nothing without a game", () => {
  expect(engineSeamLine(["games/wilds/a.ts", "packages/core/src/a.ts", "packages/core/src/a.test.ts"])).toBe(
    "Engine seam: packages/core/src/a.ts",
  );
  expect(engineSeamLine(["games/wilds/a.ts", "scripts/x.ts"])).toBe("Engine seam: none - game content only");
  expect(engineSeamLine(["packages/core/src/a.ts"])).toBeNull();
  expect(engineSeamLine(["games/AGENTS.md", "games/scripts/check.ts", "packages/core/src/a.ts"])).toBeNull();
  const many = Array.from({ length: 10 }, (_, i) => `packages/core/src/f${i}.ts`);
  expect(engineSeamLine(["games/x/y.ts", ...many])).toEndWith("and 2 more");
});

test("an unchanged API surface adds no bullets; a moved name is removed from one module and added to the other", () => {
  const a = "## @jgengine/core/a\n\n- `pack` (function): function pack(): void — Group wolves.\n";
  const b = "## @jgengine/core/b\n\n- `pack` (function): function pack(): void — Group wolves.\n";
  expect(apiNoteBullets(a, a)).toEqual({ added: [], removed: [] });
  expect(apiNoteBullets(a, b)).toEqual({
    added: ["- `pack` (`@jgengine/core/b`): Group wolves."],
    removed: ["- `@jgengine/core/a` no longer exports `pack`."],
  });
});

test("the note leads with the first changelog message, so it is the commit subject; PR-only lines sit above the sections", () => {
  expect(
    renderChangeNote({ messages: ["Closes #12", "Fixed: dens hold"], api: { added: [], removed: [] }, seam: null }),
  ).toBe("dens hold\n\nCloses #12\n\n### Fixed\n\n- dens hold\n");
});
