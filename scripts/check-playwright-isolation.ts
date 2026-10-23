// Three Playwright files in one `bun test` invocation, repeated: the repro for
// Noisemaker111/jgengine#2143. Each file owns its browser, so a failure here means one file lost its
// browser to the runner rather than a test assertion (see scripts/browser-test-budget.ts).
//
//   bun scripts/check-playwright-isolation.ts            # 20 runs, the acceptance bar
//   bun scripts/check-playwright-isolation.ts --runs 3   # a quick pass
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FILES = [
  "packages/react/src/menuNav.test.ts",
  "packages/react/src/settingsSection.test.ts",
  "packages/shell/src/settingsBoundary.test.ts",
];
/** Evidence that a browser was reaped or a test errored, even when the exit code says otherwise. */
const LOST_BROWSER = /has been closed|dangling process|^error:/m;

const runs = Number(process.argv.includes("--runs") ? process.argv[process.argv.indexOf("--runs") + 1] : 20);
if (!Number.isFinite(runs) || runs < 1) {
  console.error("check-playwright-isolation: --runs needs a positive number");
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
for (let run = 1; run <= runs; run += 1) {
  // Rotate the order so a run cannot pass by fixing one file's position.
  const order = [...FILES.slice((run - 1) % FILES.length), ...FILES.slice(0, (run - 1) % FILES.length)];
  const started = Date.now();
  const result = spawnSync("bun", ["test", ...order], { cwd: root, encoding: "utf8", timeout: 600_000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const lost = LOST_BROWSER.exec(output);
  if (result.status !== 0 || lost !== null) {
    console.error(`run ${run}/${runs}: FAIL in ${seconds}s (exit ${result.status}${lost === null ? "" : `, ${lost[0].trim()}`})\n`);
    console.error(output);
    process.exit(1);
  }
  console.log(`run ${run}/${runs}: pass ${seconds}s`);
}
console.log(`check-playwright-isolation: ${runs} run(s) of ${FILES.length} files in one invocation`);
