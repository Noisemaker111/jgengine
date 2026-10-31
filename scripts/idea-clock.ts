// Idea-to-playable clock: how long a game took from its first commit to a from-zero flow that exists,
// and whether that flow passes. Read-only; the flow only runs with --run.
import { spawnSync } from "node:child_process";

import { printHelpIfAsked, type Usage } from "./script-help";

const USAGE: Usage = {
  summary: "Time from a game's first commit to the first commit holding proofs/flows/from-zero.flow.ts, plus the flow result.",
  usage: "bun run idea-clock <gameId> [--run] [--ref <rev>]",
  flags: [
    { flag: "--run", detail: "run `bun run drive <gameId> --flow from-zero` and report pass or fail (needs a browser)" },
    { flag: "--ref <rev>", detail: "read history from this revision instead of HEAD" },
  ],
  example: "bun run idea-clock fernwild",
};

interface Stamp {
  sha: string;
  at: Date;
}

function git(args: string[]): string {
  const run = spawnSync("git", args, { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : "";
}

/** The oldest commit that touches `path` (or, with `addedOnly`, that adds it) reachable from `ref`. */
function firstCommit(ref: string, path: string, addedOnly: boolean): Stamp | null {
  const flags = addedOnly ? ["--diff-filter=A"] : [];
  const lines = git(["log", ref, ...flags, "--format=%H %aI", "--", path]).split("\n").filter((line) => line !== "");
  const last = lines[lines.length - 1];
  if (last === undefined) return null;
  const [sha = "", iso = ""] = last.split(" ");
  return { sha, at: new Date(iso) };
}

function span(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`;
}

function main(argv: string[]): number {
  if (printHelpIfAsked("idea-clock", USAGE, argv)) return 0;
  const game = argv.find((arg) => !arg.startsWith("-"));
  if (game === undefined) {
    console.error("idea-clock: give a game id (see --help)");
    return 1;
  }
  const refAt = argv.indexOf("--ref");
  const ref = refAt >= 0 ? (argv[refAt + 1] ?? "HEAD") : "HEAD";
  const first = firstCommit(ref, `games/${game}`, false);
  if (first === null) {
    console.error(`idea-clock: no commits under games/${game} from ${ref}`);
    return 1;
  }
  const flow = firstCommit(ref, `games/${game}/proofs/flows/from-zero.flow.ts`, true);
  let result = "no from-zero flow yet";
  if (flow !== null) {
    result = "not run (pass --run)";
    if (argv.includes("--run")) {
      const run = spawnSync("bun", ["run", "drive", game, "--flow", "from-zero"], { stdio: "inherit" });
      result = run.status === 0 ? "pass" : `fail (exit ${run.status ?? "signal"})`;
    }
  }
  const rows = [
    ["game", game],
    ["first commit", `${first.sha.slice(0, 9)} ${first.at.toISOString()}`],
    ["from-zero flow added", flow === null ? "-" : `${flow.sha.slice(0, 9)} ${flow.at.toISOString()}`],
    ["idea to playable", flow === null ? "-" : span(first.at, flow.at)],
    ["from-zero result", result],
  ] as const;
  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) console.log(`${key.padEnd(width)}  ${value}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
