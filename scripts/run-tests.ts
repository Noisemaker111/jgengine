// `bun run test`: every suite under the test roots, in four lanes balanced by measured cost (the
// same plan a CI shard uses), then the timing-budget files alone. One process for everything took
// longer than the script's then 600 s guard on this PC (a gate proof hit the guard with no summary,
// 2026-11-05), so a red or green `bun run test` never arrived locally. In four lanes the longest lane
// took 580 s of the 1625 files on the same PC and the guard is 900 s. A red run used to end in bun's
// own summary, thousands of lines above the files that broke; this ends it with each failing file
// and its first error, the command that reruns only those files, and the UTF-8 log holding the
// whole output, so a lane acts on the result instead of scrolling for it.
//
//   bun run test                 # every suite, in lanes
//   bun run test <bun test args> # one process, passed through: a path, --timeout, -t <name>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { digestLines, failureDigest, writeStepLog } from "./failure-digest";
import { planLanes, unitCommands, walkTestFiles } from "./test-shard";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Lanes a whole run uses: the most a lane may hold open on a developer PC beside the editor. */
export const LOCAL_LANES = 4;

/** The lines a red run ends with, from bun's output: the failing files, how to rerun them, where the log is. */
export function failureFooter(output: string, logPath: string | null): string[] {
  const files = failureDigest(output)
    .map((entry) => entry.where.replace(/:\d+$/, ""))
    .filter((where) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(where));
  const lines = ["", "test: failed", ...digestLines(output, logPath)];
  if (files.length > 0) lines.push(`  rerun only these: bun test ${[...new Set(files)].join(" ")}`);
  return lines;
}

/** `bun test` on `args`; streamed to the console unless `held`, and kept whole for the footer. */
async function bunTest(args: readonly string[], held: boolean): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn(["bun", "test", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const chunks: string[] = [];
  const tee = async (stream: ReadableStream<Uint8Array>, out: NodeJS.WriteStream): Promise<void> => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      if (!held) out.write(chunk);
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  };
  const [, , code] = await Promise.all([tee(proc.stdout, process.stdout), tee(proc.stderr, process.stderr), proc.exited]);
  return { code, output: chunks.join("") };
}

/** A group's units, each `bun test` in turn; held output is printed whole once the group ends, so lanes never interleave. */
async function runGroup(units: readonly string[], label: string, held: boolean): Promise<{ code: number; output: string }> {
  let code = 0;
  let output = "";
  const started = Date.now();
  for (const args of unitCommands(units)) {
    const run = await bunTest(args, held);
    if (code === 0) code = run.code;
    output += run.output;
  }
  if (held) process.stdout.write(output);
  console.log(`test ${label}: ${units.length} unit(s), exit ${code}, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  return { code, output };
}

async function main(argv: readonly string[]): Promise<number> {
  const results: { code: number; output: string }[] = [];
  if (argv.length > 0) {
    results.push(await bunTest(argv, false));
  } else {
    const files = walkTestFiles(root);
    const plan = planLanes(files, LOCAL_LANES, (file) => readFileSync(join(root, file), "utf8"));
    console.log(`test: ${files.length} file(s) in ${plan.lanes.length} lane(s)${plan.alone.length > 0 ? `, then ${plan.alone.length} timing-budget file(s) alone` : ""}`);
    results.push(...(await Promise.all(plan.lanes.map((lane, index) => runGroup(lane, `lane ${index + 1}/${plan.lanes.length}`, true)))));
    if (plan.alone.length > 0) results.push(await runGroup(plan.alone, "alone (timing budgets)", false));
  }
  const code = results.find((run) => run.code !== 0)?.code ?? 0;
  if (code === 0) return 0;
  const output = results.map((run) => run.output).join("\n");
  const log = writeStepLog(root, "test", "last-run", output);
  for (const line of failureFooter(output, log.slice(root.length).replaceAll("\\", "/"))) console.log(line);
  return code;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
