// A hand-rolled capture script is one `headless: false` away from a visible Chrome on Jon's desktop,
// and a crashed run leaves that window there holding gigabytes. `bun run shoot/drive/perf` are
// headless and sweep stray browsers; a script under `scripts/` or a test must launch headless too.
//
//   bun run check:capture-hygiene               # every script and test file
//   bun scripts/check-capture-hygiene.ts a.ts    # just these files (used by its own proof)
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface HygieneFinding {
  line: number;
  message: string;
}

export interface HygieneReport {
  /** Launch calls the file makes, whether or not they are legal. */
  launches: number;
  findings: HygieneFinding[];
}

const LAUNCH = /chromium\.launch(PersistentContext)?\s*\(/g;
const SPAWN = /\bspawn(?:Sync)?\s*\(/g;
const HEADLESS_OPTION = /headless\s*:\s*true/;
const TEMP_PROFILE = /tmpdir\(\)[\s\S]{0,120}?["'`]jg-/;
const CHROME_COMMAND = /findChromeExecutable\(|chrome\.exe|CHROME_PATH/;

/**
 * A persistent profile is legal when the call builds it under the temp dir, or when it passes a
 * variable the same file builds that way — `const profile = mkdtempSync(join(tmpdir(), "jg-…"))`.
 */
function tempProfileIn(call: string, source: string): boolean {
  if (TEMP_PROFILE.test(call)) return true;
  const variable = /^\(\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(call)?.[1];
  if (variable === undefined) return false;
  const assigned = new RegExp(`(?:const|let|var)\\s+${variable}\\s*=[^;\\n]{0,200}?tmpdir\\(\\)[^;\\n]{0,160}?["'\`]jg-`);
  return assigned.test(source);
}

/** The call text from `(` to its matching `)`, skipping string literals and line comments. */
export function callText(source: string, openParen: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote !== null) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openParen, index + 1);
    }
  }
  return source.slice(openParen);
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (source[cursor] === "\n") line += 1;
  return line;
}

/** Every launch in one file's source that could show a window or leave a profile behind. */
export function findCaptureHygiene(source: string): HygieneReport {
  const findings: HygieneFinding[] = [];
  let launches = 0;

  for (const match of source.matchAll(LAUNCH)) {
    launches += 1;
    const at = match.index ?? 0;
    const persistent = match[1] === "PersistentContext";
    const call = callText(source, at + match[0].length - 1);
    const line = lineAt(source, at);
    if (!HEADLESS_OPTION.test(call)) {
      findings.push({
        line,
        message: `${persistent ? "chromium.launchPersistentContext" : "chromium.launch"} without headless: true — a capture never shows a window (pass --headed to shoot/drive/perf instead)`,
      });
    }
    if (persistent && !tempProfileIn(call, source)) {
      findings.push({
        line,
        message:
          "chromium.launchPersistentContext with a profile outside the temp dir — a persistent profile must be join(tmpdir(), \"jg-…\") so the capture sweep can find and remove it",
      });
    }
  }

  for (const match of source.matchAll(SPAWN)) {
    const at = match.index ?? 0;
    const call = callText(source, at + match[0].length - 1);
    if (!CHROME_COMMAND.test(call) || call.includes("--headless")) continue;
    launches += 1;
    findings.push({
      line: lineAt(source, at),
      message: "spawns Chrome without --headless — launch it through launchChrome/startBrowser instead",
    });
  }

  return { launches, findings };
}

const root = fileURLToPath(new URL("..", import.meta.url));
/**
 * The one file allowed to assemble Chrome arguments: it builds them from `chromeRenderArgs`, which a
 * text scan cannot follow, and its launch is the headless default every other caller relies on.
 */
const OWNS_LAUNCH_FLAGS = new Set(["scripts/browser-lib.ts"]);
const SELF = "scripts/check-capture-hygiene.ts";

function scannedFiles(): string[] {
  const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (explicit.length > 0) return explicit.map((path) => resolve(path));
  const globs = ["scripts/**/*.ts", "packages/**/*.test.ts", "apps/**/*.test.ts", "examples/**/*.test.ts"];
  const files: string[] = [];
  for (const pattern of globs) {
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: root })) files.push(resolve(root, file));
  }
  return files;
}

const findings: string[] = [];
let launches = 0;
let files = 0;
for (const file of scannedFiles()) {
  if (!statSync(file).isFile() || !file.endsWith(".ts")) continue;
  const name = relative(root, file).replaceAll("\\", "/");
  if (OWNS_LAUNCH_FLAGS.has(name) || name === SELF) continue;
  const report = findCaptureHygiene(readFileSync(file, "utf8"));
  launches += report.launches;
  if (report.launches === 0) continue;
  files += 1;
  for (const finding of report.findings) findings.push(`${name}:${finding.line}: ${finding.message}`);
}

if (findings.length > 0) {
  console.error(`check-capture-hygiene: ${findings.length} headed launch(es) in ${files} file(s):`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error("Every capture is headless; `bun run shoot|drive|perf --headed` is the deliberate window, and it lands off-screen.");
  process.exit(1);
}
console.log(`check-capture-hygiene: ${launches} launch(es) in ${files} file(s), all headless`);
