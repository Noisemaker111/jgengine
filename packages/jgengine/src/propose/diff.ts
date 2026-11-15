/**
 * A unified diff of two texts, for a fork proposal's issue: what the game's copy changes in the
 * engine file it forked. Line-based longest common subsequence after trimming the shared head and
 * tail, which is most of a fork.
 */

type Op = { kind: " " | "-" | "+"; line: string; a: number; b: number };

function editScript(a: readonly string[], b: readonly string[]): Op[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;
  // lcs[i][j]: common subsequence length of midA[i..] and midB[j..].
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * (m + 1) + j] = midA[i] === midB[j] ? lcs[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(lcs[(i + 1) * (m + 1) + j]!, lcs[i * (m + 1) + j + 1]!);
    }
  }
  const ops: Op[] = [];
  for (let k = 0; k < head; k += 1) ops.push({ kind: " ", line: a[k]!, a: k, b: k });
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      ops.push({ kind: " ", line: midA[i]!, a: head + i, b: head + j });
      i += 1;
      j += 1;
    } else if (j < m && (i === n || lcs[i * (m + 1) + j + 1]! > lcs[(i + 1) * (m + 1) + j]!)) {
      ops.push({ kind: "+", line: midB[j]!, a: head + i, b: head + j });
      j += 1;
    } else {
      ops.push({ kind: "-", line: midA[i]!, a: head + i, b: head + j });
      i += 1;
    }
  }
  for (let k = 0; k < tail; k += 1) ops.push({ kind: " ", line: a[a.length - tail + k]!, a: a.length - tail + k, b: b.length - tail + k });
  return ops;
}

function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** `git diff`-style unified diff of `before` → `after` with `context` lines around each change; empty when equal. */
export function unifiedDiff(before: string, after: string, labels: { before: string; after: string }, context = 3): string {
  const ops = editScript(splitLines(before), splitLines(after));
  const changed = ops.map((op, index) => (op.kind === " " ? -1 : index)).filter((index) => index >= 0);
  if (changed.length === 0) return "";
  const out = [`--- a/${labels.before}`, `+++ b/${labels.after}`];
  let cursor = 0;
  while (cursor < changed.length) {
    const start = Math.max(0, changed[cursor]! - context);
    let end = Math.min(ops.length, changed[cursor]! + context + 1);
    while (cursor + 1 < changed.length && changed[cursor + 1]! - context <= end) {
      cursor += 1;
      end = Math.min(ops.length, changed[cursor]! + context + 1);
    }
    cursor += 1;
    const hunk = ops.slice(start, end);
    const oldCount = hunk.filter((op) => op.kind !== "+").length;
    const newCount = hunk.filter((op) => op.kind !== "-").length;
    const oldStart = oldCount === 0 ? hunk[0]!.a : hunk[0]!.a + 1;
    const newStart = newCount === 0 ? hunk[0]!.b : hunk[0]!.b + 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of hunk) out.push(`${op.kind}${op.line}`);
  }
  return `${out.join("\n")}\n`;
}
