import { POST_AUDIT_CHECKS } from "../packages/core/src/postfx/postAuditChecks";
import { GATE_SIZE } from "./perf-gate";
import { runAudit, type AuditKind, type AuditRow } from "./perf-shadow-audit";

/**
 * Proves the post chain draws the bits three's own passes drew, on live game frames.
 *
 *   bun run perf post-audit [--games a,b] [--seconds n] [--path walk|still] [--renderer webgl|webgpu]
 *
 * Each game is played at the frame gate's conditions with `?postAudit=1`: every 20th frame that drew
 * one of the chain's changed draws (the beauty/AO/contact-shadow composite, the atmosphere's single
 * blend, bloom without its clears), the page draws each of them again both ways from the same inputs
 * and counts the texels whose bits differ. Any differing texel fails the run: the frame must be the
 * same image, not a close one.
 */

const USAGE = `usage: bun run perf post-audit [--games a,b] [--seconds n] [--path walk|still] [--renderer webgl|webgpu]

  Plays each game (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off) with the post chain's audit on:
  each draw the chain does differently from three's passes is drawn three's way too, from the same
  inputs, and compared bit for bit. Fails on any differing texel.

  --games    comma-separated game ids (default: every game the frame gate measures)
  --seconds  measured window per game (default 8)
  --path     walk (default) or still
  --renderer the backend that draws: webgl (default) or webgpu`;

export type PostAuditVerdict = "identical" | "nothing changed" | "nothing compared" | "comparison failed" | `differs: ${string}` | "not measured";

export function postAuditVerdict(row: AuditRow): PostAuditVerdict {
  if (row.counters === null) return "not measured";
  const count = (name: string) => row.counters?.[name] ?? 0;
  if (count("auditFailed") > 0) return "comparison failed";
  const differing = POST_AUDIT_CHECKS.filter((check) => count(`${check}Differing`) > 0);
  if (differing.length > 0) return `differs: ${differing.join(", ")}`;
  if (count("auditFrames") === 0) return count("changedFrames") === 0 ? "nothing changed" : "nothing compared";
  return "identical";
}

/** A game whose chain has none of the changed draws (no grade, no AO, no bloom) has nothing that could differ. */
const PASSING: ReadonlySet<string> = new Set(["identical", "nothing changed"]);

export function renderPostAudit(rows: readonly AuditRow[]): string {
  const head = ["game", "frames compared", "skipped", ...POST_AUDIT_CHECKS.map((check) => `${check} (frames: texels differing)`), "verdict"];
  const body = rows.map((row) => {
    const c = row.counters ?? {};
    const cell = (name: string) => (row.counters === null ? "-" : String(c[name] ?? 0));
    const check = (name: string) => (row.counters === null || (c[`${name}Frames`] ?? 0) === 0 ? "-" : `${c[`${name}Frames`]}: ${c[`${name}Differing`] ?? 0}`);
    return [row.game, cell("auditFrames"), cell("auditSkipped"), ...POST_AUDIT_CHECKS.map(check), row.error ?? postAuditVerdict(row)];
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
