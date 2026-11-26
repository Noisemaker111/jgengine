import { afterAll, describe, expect, test } from "bun:test";

import {
  HARNESS_TEST_TIMEOUT_MS,
  POINTER_BLOCKED,
  UNREACHABLE,
  cleanupHarness,
  harnessBrowser as browser,
  harnessCli as cli,
  harnessProject,
  hasChrome,
  navigate,
  runHarnessCli,
  targetPage,
  type Click,
  type Report,
  type TargetScenario,
} from "../../../scripts/harness-browser-fixture";

afterAll(cleanupHarness);

// A drive that finds no actionable target gives up after its settle loop (about ten seconds, proven
// with a fake clock in harness.test.ts); one Chrome answers for every blocked target without waiting it out.
describe.skipIf(!hasChrome)("portable harness blocked and unreachable targets in Chromium", () => {
  test("an occluded, disabled, aria-disabled, inert or hidden target is never actionable", async () => {
    const started = await browser.startBrowser({ debugPort: 0, prefix: "jg-blocked-targets-", readyMs: 30000 });
    // Each target page at its own address, so a navigation is never mistaken for the page before it.
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => new Response(targetPage(new URL(request.url).searchParams.get("target") as TargetScenario), { headers: { "content-type": "text/html" } }) });
    let session;
    try {
      session = await browser.openPage(started.debugPort);
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      // The same page with its target in plain view is actionable, so a null below is the target's state.
      await navigate(session, `${server.url.origin}/?target=visible`);
      expect(await session.evaluate(browser.driveInputPointExpr("bAcK"))).not.toBeNull();
      for (const scenario of [...POINTER_BLOCKED, ...UNREACHABLE]) {
        await navigate(session, `${server.url.origin}/?target=${scenario}`);
        expect(await session.evaluate(browser.driveInputPointExpr("bAcK")), scenario).toBeNull();
      }
    } finally {
      session?.close();
      browser.shutdown(started.chrome, null);
      server.stop(true);
    }
  }, 40000);

  test("canonical drive on a target that never becomes actionable fails, names it, and clicks nothing", async () => {
    const clicks: Click[] = [];
    const reports: Report[] = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/click") clicks.push(await request.json() as Click);
      else if (url.pathname === "/report") reports.push(await request.json() as Report);
      else return new Response(targetPage("occluded"), { headers: { "content-type": "text/html" } });
      return new Response("ok");
    } });
    const project = harnessProject("jg-browser-blocked-");
    try {
      const { exit, stderr } = await runHarnessCli([cli, "drive", "--url", server.url.toString(), "--device", "mobile", "--click", "bAcK", "--wait", "100", "--shot", "result"], { cwd: project.dir });
      expect(stderr).toContain("using the bundled drive harness");
      expect(reports).toEqual([{ coarse: true, fine: false, touchPoints: 5, width: 390, height: 844 }]);
      expect(exit).toBe(1);
      expect(stderr).toContain('no actionable element matching "bAcK"');
      expect(clicks).toEqual([]);
    } finally {
      server.stop(true);
      project.dispose();
    }
  }, HARNESS_TEST_TIMEOUT_MS);
});
