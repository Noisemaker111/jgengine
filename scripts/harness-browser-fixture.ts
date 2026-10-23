// Shared setup for the two harness browser test files. Each file runs in its own process, so
// each materializes its own harness copy and cleans it up; the helpers and the fixture page a
// canonical drive scenario serves live here so both files prove the same page.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { materializeHarness } from "../packages/jgengine/src/harness";

const repoRoot = resolve(import.meta.dir, "..");

export const harnessDir = materializeHarness("drive");
export const harnessBrowser = await import(join(harnessDir, "browser.mjs"));
export const harnessCli = resolve(import.meta.dir, "../packages/jgengine/src/cli/index.ts");
export const driveDevCli = resolve(repoRoot, "scripts/drive-dev.ts");

export const hasChrome = ((): boolean => {
  try {
    harnessBrowser.findChrome();
    return true;
  } catch {
    return false;
  }
})();

export function cleanupHarness(): void {
  rmSync(harnessDir, { recursive: true, force: true });
}

/** A scratch project that declares the dependency the harness CLI resolves against. */
export function harnessProject(prefix: string): { dir: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "@jgengine/shell": "*" } }));
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

export type Report = { coarse: boolean; fine: boolean; touchPoints: number; width: number; height: number };
export type Click = { trusted: boolean; x: number; y: number; scroll: number };

/**
 * Run a harness CLI child. It gets its own deadline below the test's, so a stuck drive is killed
 * (SIGTERM also stops its Chrome) and fails with its stderr instead of leaking into later tests.
 */
export async function runHarnessCli(command: string[], options: { cwd: string; env?: Record<string, string | undefined>; timeoutMs?: number }) {
  const child = Bun.spawn([process.execPath, ...command], { cwd: options.cwd, env: options.env, stdout: "pipe", stderr: "pipe", timeout: options.timeoutMs ?? 40_000, killSignal: "SIGTERM" });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (child.signalCode !== null) throw new Error(`${command.slice(0, 2).join(" ")} did not exit (${child.signalCode}):\n${stderr}`);
  return { exit, stdout, stderr };
}

/** Navigate and wait until the new document has loaded, instead of sleeping and hoping it committed. */
export async function navigate(session: { send(method: string, params?: object): Promise<unknown>; evaluate(expression: string): Promise<unknown> }, url: string) {
  await session.send("Page.navigate", { url });
  const loaded = `location.href === ${JSON.stringify(url)} && document.readyState === "complete"`;
  for (;;) {
    try {
      if (await session.evaluate(loaded)) return;
    } catch {
      // The execution context is replaced while the navigation commits.
    }
    await Bun.sleep(20);
  }
}

export const TARGET_SCENARIOS = ["visible", "aria-label", "scrolled", "clipped", "partial", "occluded", "disabled", "aria-disabled", "inert", "hidden"] as const;
export type TargetScenario = (typeof TARGET_SCENARIOS)[number];

const TARGET_STYLES: Record<TargetScenario, string> = {
  visible: "",
  "aria-label": "",
  scrolled: ".spacer{height:1800px}",
  clipped: ".region{height:80px;width:200px;overflow:auto}.spacer{height:1200px}",
  partial: "button{position:fixed;left:-1200px;top:-300px;height:1000px;width:1400px}",
  occluded: ".overlay{position:fixed;inset:0;background:#ddd;z-index:10}",
  disabled: "",
  "aria-disabled": "",
  inert: "",
  hidden: "button{visibility:hidden}",
};

/** Scenarios where the harness must refuse the click; the rest must land it. */
export const BLOCKED_SCENARIOS: readonly TargetScenario[] = ["occluded", "disabled", "aria-disabled", "inert", "hidden"];

export function isBlocked(scenario: TargetScenario): boolean {
  return BLOCKED_SCENARIOS.includes(scenario);
}

/** The page a canonical drive scenario serves: one uppercase "Back" target, blocked or not. */
export function targetPage(scenario: TargetScenario): string {
  return `<!doctype html><html data-jg-capture="ready"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px;background:#134;color:white}button{padding:20px;text-transform:uppercase}${TARGET_STYLES[scenario]}</style><div class="region" ${scenario === "inert" ? "inert" : ""}><div class="spacer"></div><button ${scenario === "aria-label" ? 'aria-label="Back"' : ""} ${scenario === "disabled" ? "disabled" : ""} ${scenario === "aria-disabled" ? 'aria-disabled="true"' : ""}>${scenario === "aria-label" ? '<span aria-hidden="true">←</span>' : "<span>Back</span>"}</button></div><div class="overlay"></div><script>
        const post = (path, body) => { const x = new XMLHttpRequest(); x.open('POST', path, false); x.send(body); };
        post('/report',JSON.stringify({coarse:matchMedia('(pointer: coarse)').matches,fine:matchMedia('(pointer: fine)').matches,touchPoints:navigator.maxTouchPoints,width:innerWidth,height:innerHeight}));
        document.querySelector('button').addEventListener('click',event=>post('/click',JSON.stringify({trusted:event.isTrusted,x:event.clientX,y:event.clientY,scroll:scrollY+document.querySelector('.region').scrollTop})));
      </script></html>`;
}
