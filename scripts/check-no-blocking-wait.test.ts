import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findBlockingWaits, scanRepository } from "./check-no-blocking-wait";

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(files: Record<string, string>): string {
  const root = join(SCRATCH, `no-blocking-wait-${crypto.randomUUID()}`);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  made.push(root);
  return root;
}

test("fails every foreground wait, whatever its duration", () => {
  const source = [
    'await Bun.$`gh run watch 40034094969`;',
    'const watching = "gh pr checks 160 --watch --interval 20";',
    'await Bun.$`Start-Sleep -Seconds 90`;',
    'await Bun.$`Start-Sleep -Milliseconds 500`;',
    'await Bun.$`Start-Sleep 1`;',
    'await Bun.$`sleep 1`;',
    'await Bun.$`timeout /t 5`;',
  ].join("\n");
  expect(findBlockingWaits(source).map((wait) => [wait.line, wait.rule])).toEqual([
    [1, "CI watch"],
    [2, "CI watch"],
    [3, "sleep"],
    [4, "sleep"],
    [5, "sleep"],
    [6, "sleep"],
    [7, "sleep"],
  ]);
});

test("passes a wait that names its reason on the line or the comment above it", () => {
  const source = [
    'await Bun.$`Start-Sleep -Seconds 30`; // wait-ok: the probe port is only bound after boot',
    "// wait-ok: PowerShell blocks Start-Sleep before the child inherits stdout",
    'await Bun.$`Start-Sleep -Seconds 4`;',
    "# wait-ok: upstream CLI requires the file to settle",
    'sleep 3',
    'await Bun.$`gh run watch 1`; // wait-ok: the only way to read a completed run on this runner',
  ].join("\n");
  expect(findBlockingWaits(source)).toEqual([]);
});

test("a marker with no reason does not exempt, and prose is not a command", () => {
  const source = [
    'await Bun.$`Start-Sleep -Seconds 30`; // wait-ok:',
    "// Start-Sleep -Seconds 30 appears here only as documentation",
    "/* gh run watch 12 is mentioned in this comment */",
    'await Bun.$`sleep 2`; // wait-ok: ',
  ].join("\n");
  expect(findBlockingWaits(source).map((wait) => wait.line)).toEqual([1, 4]);
});

test("a clean script passes and a scan reports the file and line it failed on", () => {
  const root = workspace({
    "scripts/clean.ts": 'await Bun.$`gh run list --limit 3`;\nawait Bun.$`gh pr checks 7`;\n',
    "scripts/waits.ts": 'const a = 1;\nawait Bun.$`gh run list`;\nawait Bun.$`Start-Sleep -Seconds 5`;\n',
    "packages/core/src/wait.test-helpers.ts": 'export const poll = "gh pr checks 7 --watch";\n',
    "packages/core/node_modules/skip.ts": 'await Bun.$`Start-Sleep -Seconds 90`;\n',
    "scripts/waits.test.ts": 'await Bun.$`Start-Sleep -Seconds 90`;\n',
  });
  expect(scanRepository(root)).toEqual([
    { file: "scripts/waits.ts", wait: { line: 3, rule: "sleep", text: "await Bun.$`Start-Sleep -Seconds 5`;" } },
    {
      file: "packages/core/src/wait.test-helpers.ts",
      wait: { line: 1, rule: "CI watch", text: 'export const poll = "gh pr checks 7 --watch";' },
    },
  ]);
});

test("a changelog entry that describes a wait is prose, not a wait", () => {
  const root = workspace({
    "packages/core/src/meta/changelog.ts":
      [
        "export const CHANGELOG = {",
        '  "0.37.0": {',
        "    changed: [",
        '      "One lane spent 10 minutes of `Start-Sleep` calls watching a capture it had started.",',
        '      "`bun run land:queue` waits once per PR, and a lane never runs `gh run watch` or `gh pr checks --watch`.",',
        '      "Its body said: \'timeout /t 5\' and `sleep 30` are both banned.",',
        "    ],",
        "  },",
        "};",
      ].join("\n"),
    "packages/core/src/meta/notes.ts": "/* Start-Sleep 5 and gh run watch 12 described in a block comment\n   spanning two lines */\nexport const note = 1;\n",
  });
  expect(scanRepository(root)).toEqual([]);
});

test("a real wait still fails beside that prose, including a command in a template literal", () => {
  const root = workspace({
    "packages/core/src/meta/changelog.ts":
      'export const CHANGELOG = {\n  "0.37.0": {},\n};\nawait Bun.$`Start-Sleep -Seconds 5`;\n',
    "scripts/waits.ts": 'await Bun.$`sleep 5`;\nawait Bun.$`gh pr checks 7 --watch`;\n',
  });
  expect(scanRepository(root).map(({ file, wait }) => [file, wait.line, wait.rule])).toEqual([
    ["scripts/waits.ts", 1, "sleep"],
    ["scripts/waits.ts", 2, "CI watch"],
    ["packages/core/src/meta/changelog.ts", 4, "sleep"],
  ]);
});

test("this repository has no blocking wait in scripts or packages", () => {
  expect(scanRepository(join(import.meta.dir, ".."))).toEqual([]);
});
