/**
 * A script that watches CI or sleeps in the foreground spends minutes of a lane doing nothing a model
 * or a human is needed for. Over 40 hours of child sessions, sleeping and CI watching accounted for
 * 25 of 195 wall hours, almost all of it in single calls over a minute.
 *
 * None of it is necessary, so this gate allows none: a `scripts/**` or `packages/**` file fails when it
 * runs `gh run watch`, `gh pr checks --watch`, a `Start-Sleep`, a `sleep` or a `timeout /t`, whatever the
 * duration. A real need is exempted by a line comment naming the reason: `// wait-ok: <reason>`, on the
 * call's line or the comment line directly above it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["scripts", "packages"];
const EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|sh|ps1)$/;
/** Tests quote commands as fixture text far more often than they run them; check-test-spawn-timeouts covers a test that hangs. */
const TEST_FILES = /\.(?:test|spec|browser\.test)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".next", ".turbo", "coverage"]);
/**
 * This checker and its test spell out the forbidden commands as rules, messages and fixtures, the way
 * check-test-spawn-timeouts skips its own test. Nothing else is exempt.
 */
const SELF_FILES = new Set(["check-no-blocking-wait.ts", "check-no-blocking-wait.test.ts"]);

const CI_RULES: readonly { readonly rule: string; readonly pattern: RegExp }[] = [
  { rule: "CI watch", pattern: /\bgh\s+run\s+watch\b/ },
  { rule: "CI watch", pattern: /\bgh\s+pr\s+checks\b[^\n]*--watch\b/ },
];

/**
 * `packages/<pkg>/src/meta` holds documentation as data: the changelog mirror's entries are quoted prose
 * that describes waits, and a release note saying a lane spent ten minutes of `Start-Sleep` is not a wait.
 * Quoted prose and comments are masked in those files before matching; a template literal still counts,
 * because that is the shape `Bun.$` executes. Everywhere else a quoted command stays a finding, since a
 * script can hand the same string to a shell.
 */
const PROSE_PATH = /^packages\/[^/]+\/src\/meta\//;

/** `// wait-ok: reason` or `# wait-ok: reason`; the reason must be words, not a bare marker. */
const EXEMPTION = /(?:\/\/|#)\s*wait-ok:\s*[A-Za-z0-9]/i;
const SLEEP_CALL = /\bStart-Sleep\b|(?<![\w-])sleep\s+\d|\btimeout\s+\/t\s+\d/i;

export interface BlockingWait {
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

/** Prose about a command is not the command: rule names, docblocks and commented-out lines are skipped. */
function isComment(text: string): boolean {
  return /^(?:\/\/|\/\*|\*|#)/.test(text);
}

function exempt(lines: readonly string[], index: number): boolean {
  if (EXEMPTION.test(lines[index] ?? "")) return true;
  const previous = (lines[index - 1] ?? "").trim();
  return isComment(previous) && EXEMPTION.test(previous);
}

/** Carried across lines: a block comment or a multi-line string masks everything it spans. */
interface MaskState {
  readonly block: boolean;
  readonly quote: '"' | "'" | null;
}

const UNMASKED: MaskState = { block: false, quote: null };

/**
 * Blank out single- and double-quoted text and comments, keeping the rest of the line. Template literals
 * stay, so a command handed to `Bun.$` is still read as a command.
 */
function maskProse(line: string, state: MaskState): { text: string; state: MaskState } {
  let text = "";
  let block = state.block;
  let quote = state.quote;
  for (let at = 0; at < line.length; at++) {
    const char = line[at];
    if (block) {
      if (char === "*" && line[at + 1] === "/") {
        block = false;
        at++;
        text += "  ";
      } else text += " ";
      continue;
    }
    if (quote !== null) {
      if (char === "\\") {
        text += "  ";
        at++;
      } else {
        if (char === quote) quote = null;
        text += " ";
      }
      continue;
    }
    if (char === "/" && line[at + 1] === "/") break;
    if (char === "/" && line[at + 1] === "*") {
      block = true;
      text += "  ";
      at++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      text += " ";
      continue;
    }
    text += char;
  }
  return { text, state: { block, quote } };
}

/** Every foreground wait in `source`, by 1-based line. `prose` masks quoted text before matching. */
export function findBlockingWaits(source: string, options: { readonly prose?: boolean } = {}): BlockingWait[] {
  const lines = source.split("\n");
  const waits: BlockingWait[] = [];
  let mask = UNMASKED;
  lines.forEach((line, index) => {
    if (!options.prose) mask = UNMASKED;
    const masked = options.prose ? maskProse(line, mask) : null;
    if (masked !== null) mask = masked.state;
    const text = line.trim();
    if (text === "" || isComment(text) || exempt(lines, index)) return;
    const matched = masked?.text ?? line;
    const ciWatch = CI_RULES.find(({ pattern }) => pattern.test(matched));
    if (ciWatch !== undefined) {
      waits.push({ line: index + 1, rule: ciWatch.rule, text });
      return;
    }
    if (SLEEP_CALL.test(matched)) waits.push({ line: index + 1, rule: "sleep", text });
  });
  return waits;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || SELF_FILES.has(entry) || TEST_FILES.test(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTENSIONS.test(entry)) out.push(path);
  }
  return out;
}

export function scanRepository(root: string): { file: string; wait: BlockingWait }[] {
  const found: { file: string; wait: BlockingWait }[] = [];
  for (const dir of ROOTS) {
    for (const file of walk(join(root, dir))) {
      const path = relative(root, file).replace(/\\/g, "/");
      for (const wait of findBlockingWaits(readFileSync(file, "utf8"), { prose: PROSE_PATH.test(path) })) {
        found.push({ file: path, wait });
      }
    }
  }
  return found;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const found = scanRepository(root);
  if (found.length > 0) {
    console.error("check-no-blocking-wait: a script waits in the foreground\n");
    for (const { file, wait } of found) console.error(`  ${file}:${wait.line}  ${wait.rule}  ${wait.text.slice(0, 100)}`);
    console.error(
      "\nNo allowance: a sleep or a CI watch is never necessary. `bun run land` owns the landing without" +
        "\nyou watching CI, and one `gh run list` (or `gh pr checks <n>` without `--watch`) answers status" +
        "\nin a later turn. Start the work and ask later instead of sleeping or watching." +
        "\nIf the wait is genuinely required, name the reason on the line or the comment above it:" +
        "\n  // wait-ok: <reason>",
    );
    process.exit(1);
  }
  console.log("check-no-blocking-wait: ok");
}
