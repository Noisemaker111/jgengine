// Repeat a targeted Bun test under controlled concurrent load.
// bun run test:repeat --runs 20 --workers 4 -- packages/ws/src/example.test.ts
export interface RunResult {
  run: number;
  exitCode: number | null;
  signal: string | number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface Options {
  runs: number;
  workers: number;
  timeoutMs: number;
  json: boolean;
  testArgs: string[];
}

export function parseArgs(args: string[]): Options {
  const options: Options = { runs: 10, workers: 1, timeoutMs: 120_000, json: false, testArgs: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { options.testArgs = args.slice(i + 1); break; }
    if (arg === "--json") { options.json = true; continue; }
    if (arg !== "--runs" && arg !== "--workers" && arg !== "--timeout-ms") throw new Error(`unknown option: ${arg}`);
    const raw = args[++i];
    const value = Number(raw);
    if (raw === undefined || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) throw new Error(`${arg} needs a positive integer`);
    if (arg === "--runs") options.runs = value;
    else if (arg === "--workers") options.workers = value;
    else options.timeoutMs = value;
  }
  if (options.testArgs.length === 0) throw new Error("give targeted test arguments after --");
  return options;
}

export async function runBatch(command: string[], options: Pick<Options, "runs" | "workers" | "timeoutMs">): Promise<RunResult[]> {
  const results: RunResult[] = new Array(options.runs);
  let next = 0;
  async function worker() {
    while (next < options.runs) {
      const index = next++;
      const started = Date.now();
      try {
        const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", timeout: options.timeoutMs });
        const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        results[index] = { run: index + 1, exitCode, signal: child.signalCode, durationMs: Date.now() - started, stdout, stderr };
      } catch (error) {
        results[index] = { run: index + 1, exitCode: null, signal: null, durationMs: Date.now() - started, stdout: "", stderr: "", error: String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.workers, options.runs) }, () => worker()));
  return results;
}

if (import.meta.main) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const command = [process.execPath, "test", ...options.testArgs];
    const results = await runBatch(command, options);
    const failed = results.filter((result) => result.exitCode !== 0 || result.signal !== null || result.error !== undefined);
    if (options.json) console.log(JSON.stringify({ cwd: process.cwd(), command, options, results }, null, 2));
    else {
      for (const result of results) {
        console.log(`run ${result.run}/${options.runs}: ${failed.includes(result) ? "FAIL" : "pass"} (${result.durationMs} ms, exit ${result.exitCode}, signal ${result.signal})`);
        if (failed.includes(result)) console.error(`${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
      }
      console.log(`${failed.length} failed of ${results.length} runs`);
    }
    if (failed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`test:repeat: ${String(error)}`);
    process.exitCode = 1;
  }
}
