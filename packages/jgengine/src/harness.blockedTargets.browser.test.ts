import { afterAll, describe, expect, test } from "bun:test";

import {
  HARNESS_TEST_TIMEOUT_MS,
  POINTER_BLOCKED,
  cleanupHarness,
  harnessBrowser as browser,
  harnessCli as cli,
  harnessProject,
  hasChrome,
  runHarnessCli,
  targetPage,
  type Click,
  type Report,
} from "../../../scripts/harness-browser-fixture";

afterAll(cleanupHarness);

describe.skipIf(!hasChrome)("portable harness pointer-blocked targets in Chromium", () => {
  for (const scenario of POINTER_BLOCKED) {
    test(`canonical drive ${scenario} target`, async () => {
      const clicks: Click[] = [];
      const reports: Report[] = [];
      const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/click") clicks.push(await request.json() as Click);
        else if (url.pathname === "/report") reports.push(await request.json() as Report);
        else return new Response(targetPage(scenario), { headers: { "content-type": "text/html" } });
        return new Response("ok");
      } });
      const project = harnessProject("jg-browser-pointer-blocked-");
      try {
        const { exit, stdout, stderr } = await runHarnessCli([cli, "drive", "--url", server.url.toString(), "--device", "mobile", "--click", "bAcK", "--wait", "100", "--shot", "result"], { cwd: project.dir });
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
  }
});
