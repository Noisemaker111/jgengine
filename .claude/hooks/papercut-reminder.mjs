import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  /* no stdin — treat as empty */
}
if (input.stop_hook_active) process.exit(0);

function resolveTranscriptPath() {
  if (typeof input.transcript_path === "string" && existsSync(input.transcript_path)) {
    return input.transcript_path;
  }
  if (typeof input.session_id !== "string") return null;
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const sanitized = cwd.replace(/[/\\]/g, "-");
  const guess = path.join(homedir(), ".claude", "projects", sanitized, `${input.session_id}.jsonl`);
  return existsSync(guess) ? guess : null;
}

const transcriptPath = resolveTranscriptPath();
if (transcriptPath === null) process.exit(0);

let entries;
try {
  entries = readFileSync(transcriptPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null);
} catch {
  process.exit(0);
}

function messageContent(entry) {
  const content = entry?.message?.content;
  return Array.isArray(content) ? content : [];
}

// Already logged a papercut this session — nothing to remind about.
const alreadyLogged = entries.some((entry) =>
  messageContent(entry).some(
    (block) =>
      block.type === "tool_use" &&
      block.name === "Bash" &&
      typeof block.input?.command === "string" &&
      /\bpapercut\b/i.test(block.input.command),
  ),
);
if (alreadyLogged) process.exit(0);

const toolUses = [];
const resultById = new Map();
for (const entry of entries) {
  for (const block of messageContent(entry)) {
    if (block.type === "tool_use") toolUses.push(block);
    if (block.type === "tool_result") resultById.set(block.tool_use_id, block);
  }
}

function isError(toolUse) {
  return resultById.get(toolUse.id)?.is_error === true;
}

// Signal A: the exact same non-trivial Bash command was run twice in a row
// with no Edit/Write/NotebookEdit between the two runs, and at least one run
// failed — a genuine dead-end retry. Requiring "no edit in between" is what
// excludes a normal fix-test-fix loop (there, the same test command reruns
// on purpose after code changed, and that's fine).
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const commandPositions = new Map();
toolUses.forEach((toolUse, index) => {
  if (toolUse.name !== "Bash") return;
  const command = (toolUse.input?.command ?? "").trim();
  if (command.length < 8) return;
  const positions = commandPositions.get(command) ?? [];
  positions.push(index);
  commandPositions.set(command, positions);
});

let retriedFailedCommand = null;
outerRetry: for (const [command, positions] of commandPositions) {
  for (let k = 0; k < positions.length - 1; k += 1) {
    const [from, to] = [positions[k], positions[k + 1]];
    const editedBetween = toolUses.slice(from + 1, to).some((toolUse) => EDIT_TOOLS.has(toolUse.name));
    if (editedBetween) continue;
    if (isError(toolUses[from]) || isError(toolUses[to])) {
      retriedFailedCommand = command;
      break outerRetry;
    }
  }
}

// Signal B: a later Agent/Task call whose prompt heavily overlaps an earlier
// one's and explicitly corrects it (e.g. "run synchronously", "don't
// background") — the shape of a relaunch after an unusable first result.
const RELAUNCH_HINTS =
  /\b(synchronous(ly)?|don'?t background|do not background|explicit(ly)?|re-?launch|redo|instead of backgrounding|actual results?|real (report|answer|result))\b/i;

function wordSet(text) {
  return new Set((text ?? "").toLowerCase().match(/[a-z]{4,}/g) ?? []);
}
function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

const agentCalls = toolUses.filter((toolUse) => toolUse.name === "Agent" || toolUse.name === "Task");
let relaunchedAgent = null;
outer: for (let i = 0; i < agentCalls.length; i += 1) {
  for (let j = i + 1; j < agentCalls.length; j += 1) {
    const promptA = agentCalls[i].input?.prompt ?? "";
    const promptB = agentCalls[j].input?.prompt ?? "";
    if (overlapRatio(wordSet(promptA), wordSet(promptB)) > 0.4 && RELAUNCH_HINTS.test(promptB)) {
      relaunchedAgent = agentCalls[j].input?.description ?? "a subagent";
      break outer;
    }
  }
}

if (retriedFailedCommand === null && relaunchedAgent === null) process.exit(0);

const bits = [];
if (retriedFailedCommand !== null) {
  bits.push(`a Bash command was retried after failing: \`${retriedFailedCommand.slice(0, 120)}\``);
}
if (relaunchedAgent !== null) {
  bits.push(`a subagent ("${relaunchedAgent}") looks like it was relaunched after an unusable first result`);
}

const reason =
  `This session hit friction worth logging as a papercut: ${bits.join("; ")}.\n\n` +
  `Per CLAUDE.md, log it now before stopping (proactively, no need to ask first):\n` +
  `  bun run papercut -m <your-model-id> "what you were doing → what got in the way"`;

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
