import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findInProcess, globToRegExp, kindGlobs, parseTextSearchArgs, ripgrepArgs, searchText, skipGlobs } from "./textSearch";

const SCRATCH = join(import.meta.dir, "..", "..", "..", "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(files: Record<string, string>): string {
  const root = join(SCRATCH, `find-${crypto.randomUUID()}`);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  made.push(root);
  return root;
}

test("reads a pattern, a directory, extensions, globs and a limit", () => {
  expect(parseTextSearchArgs(["hubLayout", "--in", "packages/core", "--kind", "ts,tsx", "--glob", "*.test.ts", "--files", "--limit", "20"])).toEqual({
    pattern: "hubLayout",
    in: "packages/core",
    kind: ["ts", "tsx"],
    glob: ["*.test.ts"],
    files: true,
    limit: 20,
  });
});

test("--files alone lists by glob, and a bare pattern alone searches", () => {
  expect(parseTextSearchArgs(["--files", "--glob", "*.ts"])).toEqual({ pattern: undefined, in: undefined, kind: [], glob: ["*.ts"], files: true });
  expect(parseTextSearchArgs(["needle"])).toEqual({ pattern: "needle", in: undefined, kind: [], glob: [], files: false });
});

test("a flag may be spelled in any order and its value never becomes the pattern", () => {
  expect(parseTextSearchArgs(["--kind", "ts", "needle"]).pattern).toBe("needle");
  expect(parseTextSearchArgs(["needle", "--kind", "ts"]).pattern).toBe("needle");
});

test("refuses the three mistakes that would silently answer nothing", () => {
  expect(() => parseTextSearchArgs(["--limit", "5"])).toThrow("--text needs a pattern");
  expect(() => parseTextSearchArgs(["needle", "--nope"])).toThrow("unknown flag --nope");
  expect(() => parseTextSearchArgs(["needle", "--limit", "0"])).toThrow("positive whole number");
});

test("the ripgrep command skips dependencies, history, other checkouts and build output", () => {
  const args = ripgrepArgs({ pattern: "needle", kind: ["ts", "tsx"], glob: ["*.test.ts"] });
  expect(args).toContain("--line-number");
  expect(args).not.toContain("--files-with-matches");
  expect(args.filter((arg) => arg.startsWith("!"))).toEqual(["!**/node_modules/**", "!**/.git/**", "!**/.claude/**", "!**/dist/**", "!**/build/**", "!**/out/**", "!**/coverage/**", "!**/.turbo/**", "!**/.next/**", "!**/.scratch/**"]);
  expect(args).toContain("*.ts");
  expect(args).toContain("*.tsx");
  expect(args).toContain("*.test.ts");
  expect(args[args.length - 1]).toBe(".");
});

test("names are the only difference between a content search and a listing", () => {
  expect(ripgrepArgs({ pattern: "needle", files: true })).toContain("--files-with-matches");
  expect(ripgrepArgs({ files: true })).toContain("--files");
  expect(ripgrepArgs({ pattern: "needle" })).not.toContain("--no-ignore-vcs");
  expect(ripgrepArgs({ pattern: "needle", noIgnore: true })).toContain("--no-ignore-vcs");
  expect(skipGlobs(["node_modules"])).toEqual(["!**/node_modules/**"]);
  expect(kindGlobs(["ts", ".tsx"])).toEqual(["*.ts", "*.tsx"]);
});

test("a name glob becomes a matcher for the reader without ripgrep", () => {
  expect(globToRegExp("*.test.ts").test("rules.test.ts")).toBe(true);
  expect(globToRegExp("*.test.ts").test("rules.ts")).toBe(false);
  expect(globToRegExp("**/core/*.ts").test("packages/core/a.ts")).toBe(true);
  expect(globToRegExp("*.{ts,tsx}").test("a.tsx")).toBe(true);
});

test("finds file:line:match, skips node_modules, and honours --kind", () => {
  const root = workspace({
    "packages/core/a.ts": "export const hubLayout = 1;\n",
    "packages/core/a.test.ts": "hubLayout();\n",
    "packages/core/b.tsx": "hubLayout;\n",
    "packages/core/node_modules/dep/index.js": "hubLayout;\n",
    "docs/notes.md": "no mention\n",
  });
  expect(findInProcess({ pattern: "hubLayout", in: root }).lines.sort()).toEqual(["packages/core/a.test.ts:1:hubLayout();", "packages/core/a.ts:1:export const hubLayout = 1;", "packages/core/b.tsx:1:hubLayout;"]);
  expect(findInProcess({ pattern: "hubLayout", in: root, kind: ["tsx"] }).lines).toEqual(["packages/core/b.tsx:1:hubLayout;"]);
  expect(findInProcess({ pattern: "hubLayout", in: root, glob: ["*.test.ts"] }).lines).toEqual(["packages/core/a.test.ts:1:hubLayout();"]);
  expect(findInProcess({ pattern: "hubLayout", in: root, files: true }).lines.sort()).toEqual(["packages/core/a.test.ts", "packages/core/a.ts", "packages/core/b.tsx"]);
});

test("--files with no pattern lists names by glob, which is what a tree walk was for", () => {
  const root = workspace({
    "packages/core/a.ts": "",
    "packages/core/a.test.ts": "",
    "packages/editor/b.test.ts": "",
    "packages/core/node_modules/dep/c.test.ts": "",
  });
  expect(findInProcess({ files: true, in: root, kind: ["ts"] }).lines.sort()).toEqual(["packages/core/a.test.ts", "packages/core/a.ts", "packages/editor/b.test.ts"]);
  expect(findInProcess({ files: true, in: root, glob: ["*.test.ts"] }).lines.length).toBe(2);
});

test("no match is an empty answer, not an error, and a bad directory says so", () => {
  const root = workspace({ "a.ts": "nothing relevant\n" });
  expect(searchText({ pattern: "needle", in: root }).lines).toEqual([]);
  expect(() => searchText({ pattern: "needle", in: join(root, "missing") })).toThrow("--in is not a directory");
});

test("the command itself searches this checkout's source, with ripgrep or without it", () => {
  const here = join(import.meta.dir);
  const hit = searchText({ pattern: "findInProcess", in: here, kind: ["ts"] }).lines;
  expect(hit.some((line) => line.startsWith("textSearch.ts:"))).toBe(true);
  expect(searchText({ files: true, in: here, glob: ["*.test.ts"] }).lines.length).toBeGreaterThan(1);
});
