import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

// Every TypeScript sample in a README is compiled as written: a doc that shows the API cannot drift from
// it. A sample that imports a sibling file (`./tour-rules`) is the tour, which quotes its compiled files
// (apps/web/src/snippets/tour.test.ts). A fence marked `ts fragment` is a piece of a larger file, not a sample.
const root = join(import.meta.dir, "..");

function readmes(): string[] {
  const out = [join(root, "README.md"), join(root, "games", "README.md")];
  for (const dir of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (dir.isDirectory()) out.push(join(root, "packages", dir.name, "README.md"));
  }
  return out.filter((path) => existsSync(path));
}

/** The TypeScript fences of a Markdown file, with the line each starts on. */
export function codeSamples(markdown: string): { line: number; lang: "ts" | "tsx"; code: string }[] {
  const samples: { line: number; lang: "ts" | "tsx"; code: string }[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const open = /^```(ts|tsx|typescript)\s*$/.exec(lines[index]!);
    if (open === null) continue;
    const start = index + 1;
    let end = start;
    while (end < lines.length && !/^```\s*$/.test(lines[end]!)) end += 1;
    const code = lines.slice(start, end).join("\n");
    samples.push({ line: start, lang: open[1] === "tsx" || code.includes("<") && code.includes("/>") ? "tsx" : "ts", code });
    index = end;
  }
  return samples;
}

test("every README TypeScript sample compiles as written", () => {
  const where = new Map<string, string>();
  const errors: string[] = [];
  for (const readme of readmes()) {
    const dir = dirname(readme);
    const samples = codeSamples(readFileSync(readme, "utf8")).filter((sample) => !/from\s+["']\.\.?\//.test(sample.code));
    if (samples.length === 0) continue;
    // Samples compile beside their README, so a package's sample sees that package's own dependencies
    // (`convex/server` for @jgengine/convex), under the settings a game compiles with.
    const out = join(dir, ".scratch", "readme-samples");
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    for (const sample of samples) {
      // Each sample is its own module, so two samples may declare the same name.
      const file = `readme_${sample.line}.${sample.lang}`;
      writeFileSync(join(out, file), /\b(import|export)\b/.test(sample.code) ? sample.code : `${sample.code}\nexport {};\n`);
      where.set(join(out, file), `${relative(root, readme)}:${sample.line}`);
    }
    writeFileSync(join(out, "tsconfig.json"), JSON.stringify({
      extends: relative(out, join(root, "apps", "web", "tsconfig.json")).replace(/\\/g, "/"),
      compilerOptions: { noEmit: true, noUnusedLocals: false, noUnusedParameters: false, types: ["node"] },
      include: ["./*.ts", "./*.tsx"],
    }, null, 2));
    const run = spawnSync("bunx", ["tsgo", "--noEmit", "-p", join(out, "tsconfig.json")], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
    for (const line of `${run.stdout}${run.stderr}`.split(/\r?\n/)) {
      if (!line.includes("error TS")) continue;
      const file = /(readme_\d+\.tsx?)\(/.exec(line)?.[1];
      errors.push(file === undefined ? line : `${where.get(join(out, file)) ?? file}: ${line.slice(line.indexOf("error TS"))}`);
    }
  }
  expect(where.size).toBeGreaterThan(0);
  expect(errors).toEqual([]);
}, 120_000);
