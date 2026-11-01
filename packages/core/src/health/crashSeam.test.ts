import { describe, expect, test } from "bun:test";

import { createCrashSeam, installCrashHandlers, scrubCrashText, type CrashReport } from "./crashSeam";

function rig(extra: Partial<Parameters<typeof createCrashSeam>[0]> = {}) {
  const reports: CrashReport[] = [];
  let t = 1000;
  let n = 0;
  const seam = createCrashSeam({
    game: "demo",
    build: "b1",
    tier: () => "medium",
    reporter: { report: (report) => void reports.push(report) },
    now: () => t,
    newId: () => `id${++n}`,
    ...extra,
  });
  return { seam, reports, advance: (ms: number) => { t += ms; } };
}

describe("crash seam", () => {
  test("builds a structured report with build, game, tier and the last events", () => {
    const { seam, reports } = rig({ eventLimit: 3 });
    for (const name of ["a", "b", "c", "d"]) seam.note(name);
    const report = seam.capture(new Error("boom"), "tick");
    expect(report).toMatchObject({ id: "id1", build: "b1", game: "demo", tier: "medium", phase: "tick", message: "boom" });
    expect(report?.events.map((event) => event.name)).toEqual(["b", "c", "d"]);
    expect(reports).toHaveLength(1);
  });

  test("scrubs emails, url queries and home paths", () => {
    expect(scrubCrashText("hi a.b@c.com at https://x.io/p?token=1#h /home/jon/app C:\\Users\\jon\\app")).toBe(
      "hi <email> at https://x.io/p /<home>/app C:\\Users\\<home>\\app",
    );
    const { seam } = rig();
    const report = seam.capture(new Error("user a@b.co failed"), "init");
    expect(report?.message).toBe("user <email> failed");
  });

  test("drops an identical error inside the window, keeps it after", () => {
    const { seam, reports, advance } = rig({ duplicateWindowMs: 1000 });
    seam.capture(new Error("x"), "tick");
    expect(seam.capture(new Error("x"), "tick")).toBeNull();
    advance(1001);
    expect(seam.capture(new Error("x"), "tick")).not.toBeNull();
    expect(reports).toHaveLength(2);
    expect(seam.snapshot().dropped).toBe(1);
  });

  test("caps reports per session", () => {
    const { seam, reports } = rig({ maxReports: 2 });
    for (let i = 0; i < 5; i += 1) seam.capture(new Error(`e${i}`), "tick");
    expect(reports).toHaveLength(2);
  });

  test("a throwing reporter or observer never raises", () => {
    const { seam } = rig({ reporter: { report: () => { throw new Error("down"); } }, onReport: () => { throw new Error("obs"); } });
    expect(seam.capture("plain", "tick")?.message).toBe("plain");
  });

  test("guard and guardAsync capture and recover", async () => {
    const { seam, reports } = rig();
    expect(seam.guard("tick", () => { throw new Error("g"); })).toBeUndefined();
    expect(seam.guard("tick", () => 7)).toBe(7);
    expect(await seam.guardAsync("load", () => Promise.reject(new Error("a")))).toBeUndefined();
    expect(reports.map((report) => report.phase)).toEqual(["tick", "load"]);
  });

  test("global handlers route errors and rejections, and uninstall", () => {
    const { seam, reports } = rig();
    const listeners = new Map<string, (event: Event) => void>();
    const off = installCrashHandlers(seam, {
      addEventListener: (type, listener) => void listeners.set(type, listener),
      removeEventListener: (type) => void listeners.delete(type),
    });
    listeners.get("error")?.(Object.assign(new Event("error"), { error: new Error("e") }));
    listeners.get("unhandledrejection")?.(Object.assign(new Event("unhandledrejection"), { reason: new Error("r") }));
    expect(reports.map((report) => report.phase)).toEqual(["window-error", "unhandled-rejection"]);
    off();
    expect(listeners.size).toBe(0);
  });

  test("works with no reporter and resets", () => {
    const { seam } = rig({ reporter: undefined });
    expect(seam.capture(new Error("x"), "tick")).not.toBeNull();
    seam.reset();
    expect(seam.snapshot()).toEqual({ events: [], sent: 0, dropped: 0 });
  });
});
