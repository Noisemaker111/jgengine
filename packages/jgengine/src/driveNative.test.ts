import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const installedCli = process.env.JGENGINE_NATIVE_CLI;

// Opt in with the installed candidate's public bin, never the source CLI.
test.skipIf(installedCli === undefined)("installed portable CLI preserves trusted ordered canvas input in desktop and mobile CSS pixels", async () => {
  const project = mkdtempSync(join(tmpdir(), "jg-native-coordinate-"));
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "native-input-fixture", dependencies: { "@jgengine/core": "^0.18.1" } }));
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      requests++;
      const legacy = new URL(request.url).pathname === "/legacy";
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{position:absolute;inset:0;width:100vw;height:100vh}button{position:absolute;left:0;top:0;width:90px;height:40px}</style><canvas></canvas><button>Start</button><script>
        const canvas=document.querySelector('canvas'), context=canvas.getContext('2d'), events=[];
        canvas.width=innerWidth;canvas.height=innerHeight;
        context.fillStyle='#273345';context.fillRect(0,0,canvas.width,canvas.height);
        context.fillStyle='#7abd83';context.fillRect(120,100,200,130);
        let playing=false;
        document.querySelector('button').onclick=event=>{playing=true;events.push({kind:'start',trusted:event.isTrusted})};
        canvas.onpointerdown=event=>{if(playing&&event.clientX>=120&&event.clientX<320&&event.clientY>=100&&event.clientY<230)events.push({kind:'world',x:event.clientX,y:event.clientY,trusted:event.isTrusted})};
        document.onkeydown=event=>events.push({kind:'key',code:event.code,trusted:event.isTrusted});
        window.__jgengineAgent={handle:async()=>({events,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,playing})};
        ${legacy ? "" : "requestAnimationFrame(()=>{document.documentElement.dataset.jgCapture='ready'})"}
      </script>`, { headers: { "Content-Type": "text/html" } });
    },
  });
  async function run(args: string[]) {
    const child = Bun.spawn(["node", installedCli!, "drive", ...args], { cwd: project, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, status };
  }
  try {
    for (const spec of ["NaN,2", "-1,2", "390,2", "2,844", "1,2,3"]) {
      const before = requests;
      const result = await run(["--url", server.url.toString(), "--device", "mobile", "--click-at", spec, "--rpc", "{}"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--click-at");
      expect(requests).toBe(before);
    }
    for (const fixture of [
      { path: "/ready", flags: ["--width", "360", "--height", "260"], width: 360, height: 260, dpr: 1 },
      { path: "/legacy", flags: ["--device", "mobile"], width: 390, height: 844, dpr: 2 },
    ]) {
      const result = await run(["--url", new URL(fixture.path, server.url).toString(), ...fixture.flags,
        "--click", "Start", "--click-at", "180,160", "--key", "KeyA:10", "--click-at", "260,190", "--rpc", '{"method":"read_input"}']);
      expect(result.status, result.stderr).toBe(0);
      const observed = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
      console.log(JSON.stringify({ fixture: fixture.path, observed }));
      expect(observed).toEqual({ playing: true, width: fixture.width, height: fixture.height, dpr: fixture.dpr, events: [
        { kind: "start", trusted: true }, { kind: "world", x: 180, y: 160, trusted: true },
        { kind: "key", code: "KeyA", trusted: true }, { kind: "world", x: 260, y: 190, trusted: true },
      ] });
    }
  } finally {
    server.stop(true);
    rmSync(project, { recursive: true, force: true });
  }
}, 90000);
