import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEADER = `# Papercuts

Small frictions hit while working — a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha. One or two sentences: what you were doing → what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.
`;

export function formatEntry(model: string, user: string, message: string, iso: string): string {
  return `${iso} — ${model} — ${user}\n\n${message.trim()}\n`;
}

export function appendPapercut(
  file: string,
  entry: string,
  header: string = HEADER,
): void {
  if (!existsSync(file)) {
    writeFileSync(file, `${header}\n---\n\n${entry}`);
    return;
  }
  appendFileSync(file, `\n${entry}`);
}

function gitUser(): string {
  try {
    const name = execFileSync("git", ["config", "user.name"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
    })
      .toString()
      .trim();
    if (name) return name;
  } catch {
    // fall through
  }
  return process.env.USER || process.env.LOGNAME || "unknown";
}

function parseArgs(argv: string[]): { model?: string; user?: string; message: string } {
  let model: string | undefined;
  let user: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-m" || arg === "--model") {
      model = argv[++i];
    } else if (arg === "-u" || arg === "--user") {
      user = argv[++i];
    } else if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    } else {
      rest.push(arg);
    }
  }
  return { model, user, message: rest.join(" ").trim() };
}

function main(): void {
  const { model, user, message } = parseArgs(process.argv.slice(2));
  if (!message) {
    console.error('usage: bun run papercut -m <model> "what got in the way"');
    process.exit(1);
  }
  const file = join(process.cwd(), "PAPERCUTS.md");
  const entry = formatEntry(
    model || process.env.PAPERCUT_MODEL || "unknown",
    user || gitUser(),
    message,
    new Date().toISOString(),
  );
  appendPapercut(file, entry);
  console.log(`papercut logged to PAPERCUTS.md`);
}

if (import.meta.main) main();
