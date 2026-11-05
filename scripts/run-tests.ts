// `bun run test`: every suite under the test roots in one `bun test`, streamed as it runs. A red run
// used to end in bun's own summary, thousands of lines above the files that broke; this ends it
// with each failing file and its first error, the command that reruns only those files, and the
// UTF-8 log holding the whole output, so a lane acts on the result instead of scrolling for it.
//
//   bun run test                 # every suite
//   bun run test <bun test args> # passed through: a path, --timeout, -t <name>
import { fileURLToPath } from "node:url";

import { digestLines, failureDigest, writeStepLog } from "./failure-digest";
import { TEST_ROOTS } from "./test-shard";

const root = fileURLToPath(new URL("..", import.meta.url));

/** The lines a red run ends with, from bun's output: the failing files, how to rerun them, where the log is. */
export function failureFooter(output: string, logPath: string | null): string[] {
  const files = failureDigest(output)
    .map((entry) => entry.where.replace(/:\d+$/, ""))
    .filter((where) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(where));
  const lines = ["", "test: failed", ...digestLines(output, logPath)];
  if (files.length > 0) lines.push(`  rerun only these: bun test ${[...new Set(files)].join(" ")}`);
  return lines;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = argv.length > 0 ? [...argv] : [...TEST_ROOTS];
  const proc = Bun.spawn(["bun", "test", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const chunks: string[] = [];
  const tee = async (stream: ReadableStream<Uint8Array>, out: NodeJS.WriteStream): Promise<void> => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      out.write(chunk);
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  };
  const [, , code] = await Promise.all([tee(proc.stdout, process.stdout), tee(proc.stderr, process.stderr), proc.exited]);
  if (code === 0) return 0;
  const output = chunks.join("");
  const log = writeStepLog(root, "test", "last-run", output);
  for (const line of failureFooter(output, log.slice(root.length).replaceAll("\\", "/"))) console.log(line);
  return code;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
