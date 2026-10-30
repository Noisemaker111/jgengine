import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fanOutReason } from "./fan-out-guard.mjs";

test("refuses fan-out", () => {
  const refused = [
    ["Bash", "while read l; do bun run jgengine plants fit $l > log 2>&1 & done < list"],
    ["Bash", "bun run a & bun run b"],
    ["Bash", "ls | xargs -P 8 -n1 bun test"],
    ["Bash", "parallel bun test ::: a b"],
    ["Bash", "bun run jgengine plants fit maple --workers 8"],
    ["PowerShell", "bun run background start a; bun run background start b"],
    ["PowerShell", "1..4 | ForEach-Object -Parallel { bun test }"],
    ["PowerShell", "Start-Job { bun run gen }"],
  ];
  for (const [tool, command] of refused) assert.ok(fanOutReason(tool, command), command);
});

test("reads a script run by path", () => {
  const dir = mkdtempSync(join(tmpdir(), "fan-out-"));
  const file = join(dir, "refit.sh").replaceAll("\\", "/");
  writeFileSync(file, "for s in a b; do bun run fit $s & done\nwait\n");
  assert.ok(fanOutReason("Bash", `bash ${file}`));
});

test("lets ordinary commands run", () => {
  const allowed = [
    ["Bash", "bun run verify:fast 2>&1 | tail -20 && git status"],
    ["Bash", "cmd &> out.log; echo \"a & b\"; curl 'https://x.test/?a=1&b=2'"],
    ["Bash", "bun run jgengine plants fit maple --workers 4"],
    ["PowerShell", "& \"C:\\Program Files\\Git\\bin\\git.exe\" status"],
    ["PowerShell", "bun run background start bun run dev"],
  ];
  for (const [tool, command] of allowed) assert.equal(fanOutReason(tool, command), undefined, command);
});
