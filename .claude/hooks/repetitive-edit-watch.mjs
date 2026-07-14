import { appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const { session_id, tool_input } = input;
if (!tool_input?.old_string || !tool_input?.new_string) process.exit(0);

const key = JSON.stringify([
  tool_input.old_string.slice(0, 200),
  tool_input.new_string.slice(0, 200),
]);
const logPath = join(tmpdir(), `jg-edit-watch-${session_id}.jsonl`);
appendFileSync(logPath, JSON.stringify({ key, file: tool_input.file_path }) + "\n");

const lines = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const files = new Set(lines.filter((l) => l.key === key).map((l) => l.file));

if (files.size >= 3) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `You have now applied the same edit manually in ${files.size} files. Stop hand-editing: build one regex find-and-replace instead — dry-run with rg '<pattern>', then rg -l '<pattern>' | xargs sed -i -E 's/<pattern>/<replacement>/g' (or perl -pi -e for multiline), then git diff --stat to confirm scope. See CLAUDE.md → Style.`,
      },
    }),
  );
}
