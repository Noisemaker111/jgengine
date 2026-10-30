// PreToolUse guard for Bash and PowerShell: refuses commands that fan out into many processes.
// The PC is shared; one heavy job runs at a time with 4 workers at most (AGENTS.md).
import { existsSync, readFileSync } from "node:fs";

const MAX_WORKERS = 4;

const stripQuotes = (text) => text.replace(/'[^'\n]*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

/** Scripts a bash command runs by path, so a fan-out moved into a file is still seen. */
function scriptsRun(command) {
  const found = [];
  for (const match of command.matchAll(/(?:^|[;&|\s])(?:bash|sh|source|\.)\s+([^\s;&|]+\.sh)\b/g)) {
    const file = match[1];
    if (file !== undefined && existsSync(file)) found.push(readFileSync(file, "utf8"));
  }
  return found;
}

/** Why `command` is refused, or undefined when it may run. */
export function fanOutReason(tool, command) {
  const texts = tool === "Bash" ? [command, ...scriptsRun(command)] : [command];
  for (const raw of texts) {
    const text = stripQuotes(raw);
    for (const match of text.matchAll(/--workers[=\s]+(\d+)/g)) {
      if (Number(match[1]) > MAX_WORKERS) return `--workers ${match[1]} is over ${MAX_WORKERS}.`;
    }
    if (/\bxargs\b[^\n|;]*\s-P\s*\d*/.test(text) || /(?:^|[;&|\s])parallel\s/.test(text)) return "xargs -P and GNU parallel run many processes at once.";
    if ((text.match(/background\s+start\b/g) ?? []).length > 1) return "several background starts in one command.";
    if (tool === "Bash") {
      const jobs = text.replace(/&&|[<>|]&|&>|\d>&\d/g, "");
      if (/&/.test(jobs)) return "`&` starts a background job; use the tool's own background option for one job.";
    } else if (/\b(?:Start-Job|Start-ThreadJob)\b|ForEach-Object\s+-Parallel|\bforeach\s+-parallel\b/i.test(text)) {
      return "PowerShell jobs and -Parallel run many processes at once.";
    }
  }
  return undefined;
}

if (import.meta.main) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const command = input?.tool_input?.command;
  if (typeof command !== "string") process.exit(0);
  const reason = fanOutReason(input.tool_name, command);
  if (reason === undefined) process.exit(0);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Refused: ${reason} The PC is shared: run one heavy job at a time with ${MAX_WORKERS} workers or fewer. If it is too slow, give it a smaller input; never more processes.`,
      },
    }),
  );
}
