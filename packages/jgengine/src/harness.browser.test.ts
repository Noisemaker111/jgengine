import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { materializeHarness } from "./harness";

const harnessDir = materializeHarness("drive");
const browser = await import(join(harnessDir, "browser.mjs"));
let hasChrome = true;
try {
  browser.findChrome();
} catch {
  hasChrome = false;
}
afterAll(() => rmSync(harnessDir, { recursive: true, force: true }));

type Report = { coarse: boolean; fine: boolean; touchPoints: number; width: number; height: number };
type Click = { trusted: boolean; x: number; y: number; scroll: number };
const cli = resolve(import.meta.dir, "cli/index.ts");

describe.skipIf(!hasChrome)("portable harness in Chromium", () => {
  test("mobile profiles expose touch and coarse pointer; desktop clears both on the same page", async () => {
    const port = 10000 + Math.floor(Math.random() * 10000);
    const chrome = browser.launchChrome(port, "jg-harness-test-");
    let session;
    try {
      await browser.waitForDebugger(port, 30000);
      session = await browser.openPage(port);
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await session.send("Page.navigate", { url: "data:text/html,<meta name='viewport' content='width=device-width,initial-scale=1'><button style='width:100px;height:100px'>Tap</button>" });
      await browser.sleep(100);
      const desktopFine = await session.evaluate("matchMedia('(pointer: fine)').matches");
      for (const name of ["mobile", "mobile-landscape", "desktop"]) {
        const profile = browser.DEVICES[name];
        await browser.emulateDevice(session, profile);
        const report = await session.evaluate("({coarse:matchMedia('(pointer: coarse)').matches,fine:matchMedia('(pointer: fine)').matches,touchPoints:navigator.maxTouchPoints,width:innerWidth,height:innerHeight})");
        expect(report).toEqual({ coarse: profile.mobile, fine: profile.mobile ? false : desktopFine, touchPoints: profile.mobile ? 5 : 0, width: profile.width, height: profile.height });
        if (profile.mobile) {
          await session.evaluate("globalThis.touches=[];document.addEventListener('touchstart',e=>touches.push({trusted:e.isTrusted,count:e.touches.length}),{once:true})");
          await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 50, y: 50 }] });
          await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await browser.sleep(100);
          expect(await session.evaluate("touches")).toEqual([{ trusted: true, count: 1 }]);
        }
      }
    } finally {
      session?.close();
      browser.shutdown(chrome, null);
    }
  }, 40000);

  test("canonical shoot applies mobile-landscape touch before page layout", async () => {
    const reports: Report[] = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
      if (new URL(request.url).pathname === "/report") {
        reports.push(await request.json() as Report);
        return new Response("ok");
      }
      return new Response(`<!doctype html><html data-jg-capture="ready"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#124;color:white}button{padding:20px}</style><button>Capture fixture</button><script>fetch('/report',{method:'POST',body:JSON.stringify({coarse:matchMedia('(pointer: coarse)').matches,fine:matchMedia('(pointer: fine)').matches,touchPoints:navigator.maxTouchPoints,width:innerWidth,height:innerHeight})})</script></html>`, { headers: { "content-type": "text/html" } });
    } });
    const project = mkdtempSync(join(tmpdir(), "jg-shoot-project-"));
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/shell": "*" } }));
    try {
      const child = Bun.spawn([process.execPath, cli, "shoot", "--url", server.url.toString(), "--device", "mobile-landscape", "--settle", "0"], { cwd: project, stdout: "pipe", stderr: "pipe" });
      const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(stderr).toContain("using the bundled shoot harness");
      expect(exit).toBe(0);
      expect(reports).toEqual([{ coarse: true, fine: false, touchPoints: 5, width: 844, height: 390 }]);
    } finally {
      server.stop(true);
      rmSync(project, { recursive: true, force: true });
    }
  }, 45000);

  for (const scenario of ["visible", "aria-label", "scrolled", "clipped", "partial", "occluded", "disabled", "aria-disabled", "inert", "hidden"] as const) {
    test(`canonical drive ${scenario} target`, async () => {
      const clicks: Click[] = [];
      const reports: Report[] = [];
      const styles: Record<typeof scenario, string> = {
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
      const blocked = ["occluded", "disabled", "aria-disabled", "inert", "hidden"].includes(scenario);
      const html = `<!doctype html><html data-jg-capture="ready"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px;background:#134;color:white}button{padding:20px;text-transform:uppercase}${styles[scenario]}</style><div class="region" ${scenario === "inert" ? "inert" : ""}><div class="spacer"></div><button ${scenario === "aria-label" ? 'aria-label="Back"' : ""} ${scenario === "disabled" ? "disabled" : ""} ${scenario === "aria-disabled" ? 'aria-disabled="true"' : ""}>${scenario === "aria-label" ? '<span aria-hidden="true">←</span>' : "<span>Back</span>"}</button></div><div class="overlay"></div><script>
        fetch('/report',{method:'POST',body:JSON.stringify({coarse:matchMedia('(pointer: coarse)').matches,fine:matchMedia('(pointer: fine)').matches,touchPoints:navigator.maxTouchPoints,width:innerWidth,height:innerHeight})});
        document.querySelector('button').addEventListener('click',event=>fetch('/click',{method:'POST',body:JSON.stringify({trusted:event.isTrusted,x:event.clientX,y:event.clientY,scroll:scrollY+document.querySelector('.region').scrollTop})}));
      </script></html>`;
      const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/click") clicks.push(await request.json() as Click);
        else if (url.pathname === "/report") reports.push(await request.json() as Report);
        else return new Response(html, { headers: { "content-type": "text/html" } });
        return new Response("ok");
      } });
      const project = mkdtempSync(join(tmpdir(), "jg-browser-project-"));
      writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/shell": "*" } }));
      try {
        const child = Bun.spawn([process.execPath, cli, "drive", "--url", server.url.toString(), "--device", "mobile", "--click", "bAcK", "--wait", "100", "--shot", "result"], { cwd: project, stdout: "pipe", stderr: "pipe" });
        const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect(stderr).toContain("using the bundled drive harness");
        expect(reports).toEqual([{ coarse: true, fine: false, touchPoints: 5, width: 390, height: 844 }]);
        if (blocked) {
          expect(exit).toBe(1);
          expect(stderr).toContain('no actionable element matching "bAcK"');
          expect(clicks).toEqual([]);
        } else {
          expect(exit).toBe(0);
          expect(stdout).toContain("shots/result.png");
          expect(stdout).not.toContain("SOFTLOCK");
          expect(clicks).toHaveLength(1);
          expect(clicks[0]!.trusted).toBe(true);
          expect(clicks[0]!.x).toBeGreaterThan(0);
          expect(clicks[0]!.x).toBeLessThan(390);
          expect(clicks[0]!.y).toBeGreaterThan(0);
          expect(clicks[0]!.y).toBeLessThan(844);
          if (scenario === "scrolled" || scenario === "clipped") expect(clicks[0]!.scroll).toBeGreaterThan(0);
        }
      } finally {
        server.stop(true);
        rmSync(project, { recursive: true, force: true });
      }
    }, 45000);
  }
});
