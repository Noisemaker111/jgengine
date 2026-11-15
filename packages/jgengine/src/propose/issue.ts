import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { unifiedDiff } from "./diff";
import { engineRepoRoot } from "./engine";
import type { ProposalReport } from "./proposals";

/** A ready-to-file GitHub issue for one proposal. `jgengine propose` prints it; it never calls GitHub. */
export interface ProposalIssue {
  id: string;
  title: string;
  body: string;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

/** A fence longer than any backtick run in `text`, so the file shows whole. */
function fence(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

function block(language: string, text: string): string {
  const marks = fence(text);
  return `${marks}${language}\n${text.endsWith("\n") ? text : `${text}\n`}${marks}`;
}

function field(raw: unknown, key: string): unknown {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)[key] : undefined;
}

/** The issue for `report`: the need, where the part goes, the full proposal files and, for a fork, the diff against the engine file. */
export function proposalIssue(report: ProposalReport, root: string): ProposalIssue {
  const id = String(field(report.raw, "id") ?? report.path);
  const target = String(field(report.raw, "target") ?? "(missing)");
  const kind = String(field(report.raw, "kind") ?? "(missing)");
  const exportsList = field(report.raw, "exports");
  const names = Array.isArray(exportsList) ? exportsList.map((name) => `\`${String(name)}\``).join(", ") : "(missing)";
  const lines: string[] = [];
  lines.push("## Need", "", String(field(report.raw, "need") ?? "(missing)").trim(), "");
  lines.push("| | |", "| --- | --- |");
  lines.push(`| Target | \`${target}\` |`);
  lines.push(`| Kind | ${kind} |`);
  const forkPath = field(report.raw, "fork");
  if (typeof forkPath === "string") lines.push(`| Forks | \`${forkPath}\` |`);
  lines.push(`| Exports | ${names} |`);
  lines.push(`| Carried by | \`${report.game}\` (\`${report.path}\`) |`);
  lines.push(`| Status | ${report.status}${report.missingExports.length > 0 && report.status === "partial" ? ` (missing ${report.missingExports.join(", ")})` : ""} |`);
  lines.push("");
  lines.push("## Proposal", "");
  lines.push(
    `The game runs on this code today. It is written to lift into \`${target}\` as-is: the exports keep their final names and signatures, and it imports only public \`@jgengine/*\` paths and packages.`,
    "",
  );
  for (const file of report.files) {
    lines.push(`\`${posix(relative(root, file))}\``, "", block(file.endsWith(".tsx") ? "tsx" : "ts", readFileSync(file, "utf8")), "");
  }
  if (kind === "fork" && typeof forkPath === "string") {
    lines.push(`## Diff against \`${forkPath}\``, "");
    const repo = engineRepoRoot(dirname(report.file));
    let base: string | null = null;
    try {
      base = repo === null ? null : readFileSync(join(repo, forkPath), "utf8");
    } catch {
      base = null;
    }
    if (base === null) {
      lines.push(`\`${forkPath}\` is not in a local engine checkout, so the diff is left to the reviewer: compare the proposal with that file on the engine's default branch.`, "");
    } else {
      const diff = unifiedDiff(base, readFileSync(report.file, "utf8"), { before: forkPath, after: report.path });
      lines.push(diff === "" ? "The proposal is identical to the engine file." : block("diff", diff), "");
    }
  }
  if (report.errors.length > 0) {
    lines.push("## Open problems", "", ...report.errors.map((error) => `- ${error}`), "");
  }
  lines.push("## Landing", "");
  lines.push(
    `Build the exports at \`${target}\`, then the game switches its imports to \`${target}\` and deletes \`${report.path}\`; \`jgengine propose --check\` fails until it does.`,
    "",
    "_Printed by `jgengine propose`._",
  );
  return { id, title: `Engine proposal: ${id}`, body: `${lines.join("\n")}\n` };
}
