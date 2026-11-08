import { GATE_SIZE } from "./perf-gate";
import { runAudit, type AuditKind, type AuditRow } from "./perf-shadow-audit";

/**
 * Proves the post chain's merged ending draws what the separate draws would, on live game frames.
 *
 *   bun run perf post-audit [--games a,b] [--seconds n] [--path walk|still]
 *
 * Each game is played at the frame gate's conditions with `?postAudit=1`: every 20th frame on which
 * the grade also did the OutputPass's work (and temporal AA's sharpen), the page draws that frame's
 * ending both ways from the same inputs and counts the screen texels that differ. A texel off by more
 * than one level (of 255), or more than 1 texel in 1000 off at all, fails the run; that is the
 * allowance `bun run check postfx-exact` measures for the GPU compiler reordering the tone map.
 */

const USAGE = `usage: bun run perf post-audit [--games a,b] [--seconds n] [--path walk|still]

  Plays each game (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off) with the post chain's audit on:
  frames whose grade did the OutputPass's work (and temporal AA's sharpen) are drawn the separate way
  too and compared texel by texel. Fails on a texel more than one level off, or more than 1 in 1000 off.

  --games    comma-separated game ids (default: every game the frame gate measures)
  --seconds  measured window per game (default 8)
  --path     walk (default) or still`;

/** The share of compared texels that may differ by one level: the compiler's reordering of the tone map. */
export const POST_AUDIT_SHARE = 0.001;

export function postAuditVerdict(row: AuditRow): "matches" | "nothing merged" | "nothing compared" | "comparison failed" | "differs by more than one level" | "differs on too many texels" | "not measured" {
  if (row.counters === null) return "not measured";
  const count = (name: string) => row.counters?.[name] ?? 0;
  if (count("auditFailed") > 0) return "comparison failed";
  if (count("auditTexelsOverOneLevel") > 0) return "differs by more than one level";
  if (count("auditFrames") === 0) return count("tailFrames") === 0 ? "nothing merged" : "nothing compared";
  if (count("auditDifferingTexels") > count("auditTexels") * POST_AUDIT_SHARE) return "differs on too many texels";
  return "matches";
}

/** A game whose chain never merged its ending (a stylized look, a chain with no grade) has nothing that could differ. */
const PASSING: ReadonlySet<string> = new Set(["matches", "nothing merged"]);

export function renderPostAudit(rows: readonly AuditRow[]): string {
  const head = ["game", "merged frames", "with sharpen", "frames compared", "texels differing", "share", "over one level", "failed", "verdict"];
  const body = rows.map((row) => {
    const c = row.counters ?? {};
    const cell = (name: string) => (row.counters === null ? "-" : String(c[name] ?? 0));
    const texels = c["auditTexels"] ?? 0;
    const share = row.counters === null || texels === 0 ? "-" : `1 in ${Math.round(texels / Math.max(1, c["auditDifferingTexels"] ?? 0))}`;
    return [row.game, cell("tailFrames"), cell("sharpenFrames"), cell("auditFrames"), cell("auditDifferingTexels"), share, cell("auditTexelsOverOneLevel"), cell("auditFailed"), row.error ?? postAuditVerdict(row)];
  });
  const widths = head.map((cell, column) => Math.max(cell.length, ...body.map((line) => (line[column] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [line(head), ...body.map(line)].join("\n");
}

const POST_AUDIT: AuditKind = {
  name: "post-audit",
  param: "postAudit",
  system: "render/postfx",
  missing: "no post chain on the page",
  verdict: postAuditVerdict,
  passing: PASSING,
  render: renderPostAudit,
};

if (import.meta.main) await runAudit(POST_AUDIT, process.argv.slice(2), USAGE);
