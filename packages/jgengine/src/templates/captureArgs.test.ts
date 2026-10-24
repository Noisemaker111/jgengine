import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { materializeHarness } from "../harness";
import { CAPTURE_FLAGS, describeFlow, describeStepFile, parseCaptureArgs, parseGraphicsTier, parseStepFile, rejectMixedStepFlags, type CaptureFlag, type CaptureTool } from "./captureArgs";

/** A valid value for each flag, so every flag can be exercised by every host. */
export function sampleArgv(entry: CaptureFlag): string[] {
  const samples: Record<string, string> = {
    "--steps": "steps.json", "--flow": "to-menu", "--log": "drive.log.jsonl", "--click": "Start", "--double-click": "Tile", "--click-at": "10,20", "--right-click-at": "30,40",
    "--fill": "Name=Ada", "--key": "KeyW+KeyD:250", "--wait": "100", "--shot": "after",
    "--rpc": '{"method":"debug_snapshot"}', "--probe": "p0", "--url": "http://127.0.0.1:5173/", "--port": "5199",
    "--device": "mobile", "--width": "800", "--height": "600", "--size": "half", "--quality": "ultra", "--settle": "500", "--timeout": "90",
    "--param": "gamepad=2", "--out": "/tmp/x.png", "--seed": "3", "--sample": "200", "--softlock": "1500",
    "--epsilon": "0.01", "--game": "demo", "--mode": "play", "--state": "two-towers", "--run": "game.start",
    "--view": "hero", "--look": "1,2", "--look-from": "12,5", "--spawn": "1,0,1", "--style": "toon",
    "--preview": "hud", "--fixture": "bars", "--site": "/play", "--connect": "9223", "--record": "clip",
    "--record-fps": "12", "--record-width": "480",
  };
  if (entry.value === "none") return [entry.flag];
  const value = samples[entry.flag];
  if (value === undefined) throw new Error(`no sample value for ${entry.flag}; add one`);
  return [entry.flag, value];
}

const tools: CaptureTool[] = ["shoot", "drive"];

describe("parseCaptureArgs", () => {
  test("parses every flag of each tool and refuses unknown and other-tool flags", () => {
    for (const tool of tools) {
      for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool))) {
        expect(() => parseCaptureArgs(tool, sampleArgv(entry), CAPTURE_FLAGS)).not.toThrow();
      }
      expect(() => parseCaptureArgs(tool, ["--clik", "x"], CAPTURE_FLAGS)).toThrow("unknown option --clik");
    }
    expect(() => parseCaptureArgs("shoot", ["--click", "Start"], CAPTURE_FLAGS)).toThrow("drive option");
  });

  test("--quality pins one of the four graphics tiers and rejects anything else by name", () => {
    for (const tool of tools) {
      for (const tier of ["low", "medium", "high", "ultra"]) {
        expect(parseCaptureArgs(tool, ["--quality", tier], CAPTURE_FLAGS).options.quality).toBe(tier);
      }
      expect(() => parseCaptureArgs(tool, ["--quality", "draft"], CAPTURE_FLAGS)).toThrow("--quality must be one of low, medium, high, ultra (got draft)");
      expect(() => parseCaptureArgs(tool, ["--quality", "HIGH"], CAPTURE_FLAGS)).toThrow("must be one of low, medium, high, ultra");
    }
    expect(parseGraphicsTier("ultra")).toBe("ultra");
    expect(() => parseGraphicsTier(undefined)).toThrow("--quality must be one of low, medium, high, ultra (got nothing)");
  });

  test("--draft is the iteration preset, so it cannot ride with --quality", () => {
    expect(parseCaptureArgs("shoot", ["--draft"], CAPTURE_FLAGS).options.draft).toBe(true);
    expect(parseCaptureArgs("drive", ["--draft", "--size", "half"], CAPTURE_FLAGS).options.draft).toBe(true);
    expect(() => parseCaptureArgs("drive", ["--draft", "--quality", "ultra"], CAPTURE_FLAGS)).toThrow("--draft is the iteration preset");
  });

  test("keeps steps ordered and defaults debug_snapshot to the summary", () => {    const parsed = parseCaptureArgs("drive", ["demo", "--click-at", "10,20", "--key", "mouse0:1200", "--rpc", '{"method":"debug_snapshot"}', "--shot", "/tmp/a.png"], CAPTURE_FLAGS);
    expect(parsed.positionals).toEqual(["demo"]);
    expect(parsed.steps).toEqual([
      { kind: "click-at", spec: "10,20", button: "left" },
      { kind: "key", code: "mouse0", holdMs: 1200 },
      { kind: "rpc", json: '{"method":"debug_snapshot","detail":"summary"}', summarized: true },
      { kind: "shot", name: "/tmp/a.png", out: "/tmp/a.png" },
    ]);
    expect(parseCaptureArgs("drive", ["--rpc", '{"method":"debug_snapshot","detail":"full"}'], CAPTURE_FLAGS).steps[0]).toMatchObject({ summarized: false });
    expect(() => parseCaptureArgs("drive", ["--shot", "shots/a.png"], CAPTURE_FLAGS)).toThrow("not a relative path");
    expect(() => parseCaptureArgs("shoot", ["--port", "--width"], CAPTURE_FLAGS)).toThrow("--port requires a value");
  });
});

describe("parseStepFile", () => {
  const error = (steps: unknown): string => {
    try {
      parseStepFile({ steps }, "proof.json");
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
    throw new Error("expected the step file to be rejected");
  };

  test("normalizes every kind into the flag executor's step list", () => {
    const steps = parseStepFile({
      steps: [
        { click: "Free skirmish", before: { is: "menu.ready" }, after: { is: "skirmish.started", timeoutMs: 4000 } },
        { key: "KeyH", ms: 120 },
        { rightClickAt: [420, 220] },
        { shot: "formation-line" },
        { waitFor: "squad.formation === 'line'", timeoutMs: 2000 },
        { fill: { label: "Commander", value: "Ada" } },
        { rpc: { method: "debug_snapshot" } },
        { reload: true },
      ],
    }, "proof.json");
    expect(steps[0]).toMatchObject({ kind: "click", text: "Free skirmish", before: { is: "menu.ready" }, after: { is: "skirmish.started", timeoutMs: 4000 } });
    expect(steps[1]).toMatchObject({ kind: "key", code: "KeyH", holdMs: 120 });
    expect(steps[2]).toMatchObject({ kind: "click-at", spec: "420,220", button: "right" });
    expect(steps[3]).toEqual({ kind: "shot", name: "formation-line" });
    expect(steps[4]).toMatchObject({ kind: "waitFor", expression: "squad.formation === 'line'", timeoutMs: 2000 });
    expect(steps[5]).toMatchObject({ kind: "fill", label: "Commander", value: "Ada" });
    expect(steps[6]).toMatchObject({ kind: "rpc", summarized: true });
    expect(steps[7]).toEqual({ kind: "reload" });
    expect(describeStepFile(steps, "proof.json")).toContain("#1 click \"Free skirmish\" before<=15000ms after<=4000ms");
  });

  test("names the index and the valid kinds for an unknown step kind", () => {
    const message = error([{ click: "Start" }, { tapp: "Free skirmish" }]);
    expect(message).toContain("steps[1]");
    expect(message).toContain("unknown step kind \"tapp\"");
    expect(message).toContain("click, doubleClick, clickAt");
  });

  test("names the index for a coordinate that is a string instead of a number pair", () => {
    expect(error([{ click: "Start" }, { key: "KeyH", ms: 10 }, { wait: 5 }, { shot: "a" }, { rightClickAt: "420,220" }]))
      .toBe("steps[4].rightClickAt: expected [x, y] numbers, got \"420,220\"");
  });

  test("parses aim steps and lists them in --check with their conditions", () => {
    const steps = parseStepFile({
      steps: [
        { moveMouse: [640, 360], before: { is: "menu.ready" } },
        { look: [-120, 40] },
        { aimAt: "crosshair.target()", tolerancePx: 4, after: { is: "aim.onTarget", timeoutMs: 3000 } },
      ],
    }, "aim.json");
    expect(steps[0]).toMatchObject({ kind: "move-mouse", x: 640, y: 360, before: { is: "menu.ready" } });
    expect(steps[1]).toEqual({ kind: "look", dx: -120, dy: 40 });
    expect(steps[2]).toMatchObject({ kind: "aim-at", expression: "crosshair.target()", tolerancePx: 4, after: { is: "aim.onTarget", timeoutMs: 3000 } });
    expect(parseStepFile({ steps: [{ aimAt: "[10, 20]" }] }, "aim.json")[0]).toMatchObject({ tolerancePx: 6 });
    const listed = describeStepFile(steps, "aim.json");
    expect(listed).toContain("#1 moveMouse 640,360 before<=15000ms");
    expect(listed).toContain("#2 look -120,40 px");
    expect(listed).toContain("#3 aimAt \"crosshair.target()\" within 4px after<=3000ms");
  });

  test("names the index and the field for a malformed aim coordinate or target", () => {
    expect(error([{ click: "Start" }, { look: [10, "20"] }])).toBe("steps[1].look: expected [x, y] numbers, got [10,\"20\"]");
    expect(error([{ moveMouse: [1, 2, 3] }])).toBe("steps[0].moveMouse: expected [x, y] numbers, got [1,2,3]");
    expect(error([{ aimAt: "" }])).toContain("steps[0].aimAt: expected the page expression");
    expect(error([{ aimAt: "target()", tolerancePx: 0 }])).toContain("steps[0].tolerancePx: expected a positive number");
    expect(error([{ look: [1, 2], tolerancePx: 3 }])).toContain("steps[0]: \"tolerancePx\" sizes an aimAt target");
  });

  test("names the index for an unknown key code", () => {
    const message = error([{ click: "Start" }, { wait: 1 }, { key: "KeyHH", ms: 120 }]);
    expect(message).toContain("steps[2].key: unknown key code \"KeyHH\"");
    expect(message).toContain("KeyA-KeyZ");
  });

  test("names the index for two kinds in one object and for a bad condition", () => {
    expect(error([{ click: "Start", key: "KeyH" }])).toContain("steps[0]: one step kind per object, got click and key");
    expect(error([{ click: "Start", before: { is: "" } }])).toContain("steps[0].before: \"is\" must be the page expression");
    expect(error([{ shot: "docs/a" }])).toContain("steps[0].shot: a shot is a bare name");
  });

  test("rejects a file that would run nothing and rejects a half-readable shape", () => {
    expect(error([])).toContain("steps list is empty");
    expect(() => parseStepFile({ step: [] }, "proof.json")).toThrow("unknown top-level field \"step\"");
    expect(() => parseStepFile({ steps: [null] }, "proof.json")).toThrow("steps[0]: expected a step object");
  });

  test("refuses mixing --steps with step flags and names the flag", () => {
    expect(() => rejectMixedStepFlags("drive", ["demo", "--steps", "proof.json", "--click", "Start"], CAPTURE_FLAGS))
      .toThrow("drop the step flags (--click)");
    expect(() => rejectMixedStepFlags("drive", ["demo", "--steps", "proof.json", "--wait", "1000", "--shot", "a"], CAPTURE_FLAGS))
      .toThrow("--wait, --shot");
    expect(() => rejectMixedStepFlags("drive", ["demo", "--steps", "proof.json"], CAPTURE_FLAGS)).not.toThrow();
  });

  test("parses an assert as expression, expected value and note, defaulting to true", () => {
    const steps = parseStepFile({
      steps: [
        { assert: "skirmish.started" },
        { assert: "skirmish.units.length", is: 4, note: "four units on the field" },
        { assert: "squad.formation", is: "line" },
      ],
    }, "proof.json");
    expect(steps[0]).toEqual({ kind: "assert", expression: "skirmish.started", expected: true });
    expect(steps[1]).toEqual({ kind: "assert", expression: "skirmish.units.length", expected: 4, note: "four units on the field" });
    expect(steps[2]).toMatchObject({ kind: "assert", expected: "line" });
    expect(describeStepFile(steps, "proof.json")).toContain("#2 assert \"skirmish.units.length\" is 4");
    expect(error([{ click: "Start", is: true }])).toContain("\"is\" is the assert expectation");
    expect(error([{ assert: "" }])).toContain("steps[0].assert: expected the page expression");
  });
});

describe("parseStepFile flows", () => {
  const flows: Record<string, unknown> = {
    "to-menu": { steps: [{ reload: true }, { assert: "menu.ready", note: "the field desk is up" }] },
    "to-skirmish": { steps: [{ flow: "to-menu" }, { click: "Free skirmish" }, { assert: "skirmish.started" }] },
    "cycle-a": { steps: [{ flow: "cycle-b" }] },
    "cycle-b": { steps: [{ flow: "cycle-a" }] },
    "self": { steps: [{ flow: "self" }] },
    "deep-1": { steps: [{ flow: "deep-2" }] },
    "deep-2": { steps: [{ flow: "deep-3" }] },
    "deep-3": { steps: [{ flow: "deep-4" }] },
    "deep-4": { steps: [{ flow: "deep-5" }] },
    "deep-5": { steps: [{ assert: "true" }] },
  };
  const reader = (name: string) => (flows[name] === undefined ? undefined : { json: flows[name], source: "flows/" + name + ".json" });
  const parse = (steps: unknown) => parseStepFile({ steps }, "proof.json", { flows: reader });
  const messageOf = (steps: unknown): string => {
    try {
      parse(steps);
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
    throw new Error("expected the flow to be rejected");
  };

  test("expands an include in place, keeping the flow's own steps and asserts", () => {
    const steps = parse([{ key: "KeyH", ms: 100 }, { flow: "to-skirmish" }]);
    expect(steps.map((step) => step.kind)).toEqual(["key", "reload", "assert", "click", "assert"]);
    expect(steps[3]).toMatchObject({ kind: "click", text: "Free skirmish" });
    expect(describeFlow("to-skirmish", steps.slice(1))).toContain("4 step(s)");
    expect(describeFlow("to-skirmish", steps.slice(1))).toContain("asserts menu.ready; skirmish.started");
    expect(describeFlow("no-assert", [{ kind: "click", text: "Start" }])).toContain("asserts nothing");
  });

  test("rejects a cycle by name", () => {
    expect(messageOf([{ flow: "cycle-a" }])).toContain("flow cycle by name: cycle-a -> cycle-b -> cycle-a");
    expect(messageOf([{ flow: "self" }])).toContain("flow cycle by name: self -> self");
  });

  test("rejects an unknown flow by name", () => {
    const message = messageOf([{ click: "Start" }, { flow: "to-base" }]);
    expect(message).toContain("steps[1].flow");
    expect(message).toContain("no flow named \"to-base\"");
  });

  test("rejects nesting deeper than four flows and names the chain", () => {
    const message = messageOf([{ flow: "deep-1" }]);
    expect(message).toContain("flows nest at most 4 deep");
    expect(message).toContain("deep-1 -> deep-2 -> deep-3 -> deep-4 -> deep-5");
    expect(() => parse([{ flow: "deep-1" }])).toThrow();
    const capped = { ...flows, "deep-4": { steps: [{ assert: "true" }] } };
    expect(parseStepFile({ steps: [{ flow: "deep-1" }] }, "proof.json", {
      flows: (name: string) => (capped[name] === undefined ? undefined : { json: capped[name], source: "flows/" + name + ".json" }),
    }).map((step) => step.kind)).toEqual(["assert"]);
  });

  test("refuses an include with fields of its own and a flow name that is a path", () => {
    expect(messageOf([{ flow: "to-menu", before: { is: "menu.ready" } }])).toContain("an include carries no fields of its own");
    expect(messageOf([{ flow: "proofs/flows/to-menu" }])).toContain("a flow is a bare name");
  });
});

describe("portable harness parity", () => {
  test("the embedded browser.mjs parser is the same function and agrees on every flag", async () => {
    const dir = materializeHarness("drive");
    try {
      const portable = await import(pathToFileURL(join(dir, "browser.mjs")).href);
      expect(portable.CAPTURE_FLAGS).toEqual(JSON.parse(JSON.stringify(CAPTURE_FLAGS)));
      for (const tool of tools) {
        for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool))) {
          const argv = sampleArgv(entry);
          expect(portable.parseCaptureArgs(tool, argv, portable.CAPTURE_FLAGS)).toEqual(parseCaptureArgs(tool, argv, CAPTURE_FLAGS));
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("drive.mjs and shoot.mjs accept every portable flag and name each engine-only one", () => {
    for (const tool of tools) {
      const dir = materializeHarness(tool);
      try {
        for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool))) {
          const run = spawnSync(process.execPath, [join(dir, `${tool}.mjs`), ...sampleArgv(entry), "--help"], { encoding: "utf8", timeout: 30_000 });
          expect({ flag: entry.flag, status: run.status }).toEqual({ flag: entry.flag, status: 0 });
          if (entry.engineOnly === undefined) continue;
          const refused = spawnSync(process.execPath, [join(dir, `${tool}.mjs`), ...sampleArgv(entry)], { encoding: "utf8", timeout: 30_000 });
          expect(refused.status).toBe(1);
          expect(refused.stderr).toContain(`${entry.flag} ${entry.engineOnly}`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
