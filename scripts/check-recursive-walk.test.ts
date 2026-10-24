import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findRecursiveWalks, scanRepository } from "./check-recursive-walk";

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(files: Record<string, string>): string {
  const root = join(SCRATCH, `recursive-walk-${crypto.randomUUID()}`);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  made.push(root);
  return root;
}

test("fails every way a lane walks a tree, whatever the shell", () => {
  const source = [
    "Get-ChildItem -Recurse -Filter *.ts",
    "gci -Path . -Recurse",
    "dir /s /b *.ts",
    "tree /f",
    "find . -name '*.ts'",
    "find / -name node_modules",
    "find ~ -maxdepth 2",
    "git ls-files | ForEach-Object { Get-Item $_ }",
  ].join("\n");
  expect(findRecursiveWalks(source).map((walk) => [walk.line, walk.rule])).toEqual([
    [1, "recursive listing"],
    [2, "recursive listing"],
    [3, "recursive listing"],
    [4, "recursive listing"],
    [5, "root walk"],
    [6, "root walk"],
    [7, "root walk"],
    [8, "ls-files loop"],
  ]);
});

test("passes the searches that read the tree once", () => {
  const source = [
    'const found = search({ pattern: "hubLayout" });',
    "bun run find hubLayout --kind ts,tsx",
    "bun run find --files --glob '*.test.ts'",
    "rg --files -g '*.ts'",
    "git ls-files -z",
    "const files = readdirSync(join(dir, 'package'), { recursive: true });",
  ].join("\n");
  expect(findRecursiveWalks(source)).toEqual([]);
});

test("a walk that names its reason on the line or above it passes, and a bare marker does not", () => {
  const source = [
    "Get-ChildItem -Recurse -Filter *.ts // walk-ok: the install script owns the whole checkout",
    "// walk-ok: the export reads every shipped file once, under a second",
    "Get-ChildItem -Recurse -File",
    "<!-- walk-ok: the release notes list every package, and the tree is 40 files -->",
    "Get-ChildItem -Recurse -File",
    "Get-ChildItem -Recurse // walk-ok:",
  ].join("\n");
  expect(findRecursiveWalks(source).map((walk) => walk.line)).toEqual([6]);
});

test("a scan reports the file and line, and reads scripts plus the documents a lane copies", () => {
  const root = workspace({
    "scripts/slow.ts": "const a = 1;\nGet-ChildItem -Recurse\n",
    "scripts/fast.ts": "bun run find needle\n",
    "AGENTS.md": "# repo\n\nSearch with `bun run find`, never a tree listing.\n",
    ".claude/skills/workflow/SKILL.md": "1. List the tree:\n   `Get-ChildItem -Recurse -Filter *.ts`\n",
    "README.md": "Commands live here.\n",
    "packages/core/node_modules/ignored.ts": "Get-ChildItem -Recurse\n",
    "changes/notes.md": "Get-ChildItem -Recurse\n",
  });
  expect(scanRepository(root)).toEqual([
    {
      file: ".claude/skills/workflow/SKILL.md",
      line: 2,
      rule: "recursive listing",
      text: "`Get-ChildItem -Recurse -Filter *.ts`",
    },
    { file: "scripts/slow.ts", line: 2, rule: "recursive listing", text: "Get-ChildItem -Recurse" },
  ]);
});

test("this repository ships no recursive walk in its tooling or lane documents", () => {
  expect(scanRepository(join(import.meta.dir, ".."))).toEqual([]);
});
