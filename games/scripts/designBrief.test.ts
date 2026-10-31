import { describe, expect, test } from "bun:test";

import { EXAMPLE_BRIEF } from "./briefExample";
import { BRIEF_PENDING_LINE, briefDue, briefPending, milestoneOneDone, readDesignBrief } from "./designBrief";
import { addedSinceBase, judge, parseKnownFailing, verdictLines } from "./knownFailing";

const plan = (brief: string): string => `# Courier plan\n\n${brief}\n## Milestones\n\n- [ ] 1. the first ten minutes\n`;

function problems(brief: string): string[] {
  const read = readDesignBrief(plan(brief));
  return read.ok ? [] : read.problems;
}

describe("design brief", () => {
  test("a complete brief reads into its numbers and tables", () => {
    const read = readDesignBrief(plan(EXAMPLE_BRIEF));
    if (!read.ok) throw new Error(read.problems.join("\n"));
    expect(read.brief.paceMinutes).toBe(2);
    expect(read.brief.longestCycleMinutes).toBe(30);
    expect(read.brief.minutesOfContent).toBe(600);
    expect(read.brief.beats.map((beat) => beat.at)).toEqual([0, 90, 240, 390, 540]);
    expect([...read.brief.budget]).toEqual([["items", 40], ["areas", 6], ["verbs", 12]]);
    expect(read.brief.startState.get("itemsSeen")).toBe(1);
    expect(read.brief.systems.get("vehicles")).toBe("vehiclesOwned");
  });

  test("a plan with only features and milestones has no brief", () => {
    expect(problems("## Features\n\n- one more system\n")).toEqual(['has no "## Design brief" section in PLAN.md']);
  });

  test("each missing line is named", () => {
    const found = problems(EXAMPLE_BRIEF.replace(/^- Long loop:.*\n/m, "").replace(/^- Second 0:.*\n/m, ""));
    expect(found).toEqual([
      'brief has no "- Long loop: ..." line (the hours of progression)',
      'brief has no "- Second 0: ..." line (what the player has at the start, and why)',
    ]);
  });

  test("a demo-length first ten minutes fails: too few beats, nothing taught early, a short plan", () => {
    const demo = EXAMPLE_BRIEF.replace(/### First 10 minutes[^]*?### Start state/, "### First 10 minutes\n\n- 0:00 a full park\n- 3:00 more guests; unlocks nothing new\n\n### Start state");
    const found = problems(demo);
    expect(found).toContain('brief\'s first 10 minutes has 2 timed beats ("- m:ss ..."); it needs at least 5');
    expect(found).toContain("brief's last beat is at 3:00; plan the first 10 minutes to at least 8:00");
    expect(found).toContain("brief has no beat by 2:00 that teaches or unlocks something");
    expect(found).toContain("brief beats 0:00 say neither what is taught nor what unlocks");
  });

  test("a content budget of two kinds and a two-system game are too thin to plan hours", () => {
    const thin = EXAMPLE_BRIEF.replace("| verbs | 12 |\n", "").replace("| jobs | jobsTaken |\n| rivals | racesRun |\n", "");
    expect(problems(thin)).toEqual([
      "brief's content budget names 2 kinds; it needs at least 3 (verbs, items, areas...)",
      "brief names 2 systems; it needs at least 4",
    ]);
  });
});

describe("known-failing list", () => {
  const list = parseKnownFailing(JSON.stringify({ "$comment": "shrink only", demo: { brief: "no brief", depth: "two-minute cycles" } }));

  test("parses game -> rule -> reason and refuses an unknown rule or an empty reason", () => {
    expect(list.get("demo")?.get("depth")).toBe("two-minute cycles");
    expect(() => parseKnownFailing(JSON.stringify({ demo: { looks: "bad" } }))).toThrow('names rule "looks"');
    expect(() => parseKnownFailing(JSON.stringify({ demo: { brief: " " } }))).toThrow("needs the reason");
  });

  test("an entry the base did not have is a problem; a removed one is not", () => {
    const base = { kind: "list" as const, list: parseKnownFailing(JSON.stringify({ demo: { brief: "no brief" } })) };
    expect(addedSinceBase(list, base, ["brief", "depth"])).toEqual([
      'demo was added to games/scripts/depth-known-failing.json for "depth"; the list only shrinks - make the game pass instead',
    ]);
    expect(addedSinceBase(list, base, ["brief"])).toEqual([]);
    const smaller = parseKnownFailing("{}");
    expect(addedSinceBase(smaller, base, ["brief", "depth"])).toEqual([]);
    expect(addedSinceBase(list, { kind: "new" }, ["brief", "depth"])).toEqual([]);
  });

  test("a failing listed game is known, a passing listed one is stale, an unlisted failure fails", () => {
    expect(judge("demo", "brief", ["missing"], list).status).toBe("known");
    expect(verdictLines("t", "demo", "brief", judge("demo", "brief", [], list)).failed).toBe(true);
    expect(verdictLines("t", "other", "brief", judge("other", "brief", ["missing"], list)).failed).toBe(true);
    expect(verdictLines("t", "other", "brief", judge("other", "brief", [], list)).failed).toBe(false);
  });
});

describe("brief ordering", () => {
  const scaffold = (tick: " " | "x", brief = BRIEF_PENDING_LINE): string =>
    `# Probe plan\n\n## Direction\n\n- a walk\n\n## Design brief\n\n${brief}\n\n## Milestones\n\n- [${tick}] 1. the core loop plays from second 0\n- [ ] 2. the next ten minutes\n`;

  test("a pending brief passes while milestone 1 is unticked", () => {
    expect(briefPending(scaffold(" "))).toBe(true);
    expect(milestoneOneDone(scaffold(" "))).toBe(false);
    expect(briefDue(scaffold(" "))).toEqual({ ok: true, pending: true });
  });

  test("ticking milestone 1 makes the full brief due", () => {
    const read = briefDue(scaffold("x"));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems[0]).toBe("milestone 1 is ticked, so the design brief is due: replace its pending line with the brief");
    expect(read.problems.length).toBeGreaterThan(1);
  });

  test("a written brief is judged in full whatever the milestones say", () => {
    const written = briefDue(scaffold("x", EXAMPLE_BRIEF.replace(/^## Design brief\n/m, "")));
    expect(written.ok && !("pending" in written)).toBe(true);
    const broken = briefDue(scaffold(" ", "- Core loop: walk\n"));
    expect(broken.ok).toBe(false);
  });
});
