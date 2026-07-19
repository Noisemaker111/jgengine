import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createCoachMarkSequence } from "@jgengine/core/ui/coachMarks";

import { CoachMark, CoachMarkHost } from "./coachMarks";

function view() {
  return { step: { id: "welcome", title: "Welcome", body: "Take the tour." }, index: 0, total: 3, remaining: 3 };
}

describe("CoachMark", () => {
  test("renders title, body, counter, and Next while more remain", () => {
    const html = renderToStaticMarkup(
      createElement(CoachMark, { view: view(), onNext: () => {}, onSkip: () => {} }),
    );
    expect(html).toContain('data-coach-mark="welcome"');
    expect(html).toContain("Welcome");
    expect(html).toContain("Take the tour.");
    expect(html).toContain("1 of 3");
    expect(html).toContain("Next");
    expect(html).toContain("Skip tour");
  });

  test("shows the done label on the last step", () => {
    const last = { step: { id: "end", title: "Done" }, index: 2, total: 3, remaining: 1 };
    const html = renderToStaticMarkup(
      createElement(CoachMark, { view: last, onNext: () => {}, onSkip: () => {}, doneLabel: "Got it" }),
    );
    expect(html).toContain("Got it");
    expect(html).not.toContain(">Next<");
  });
});

describe("CoachMarkHost", () => {
  test("renders the current centered step from a sequence", () => {
    const sequence = createCoachMarkSequence({
      steps: [{ id: "intro", title: "Hello", body: "First hint" }],
      now: () => 0,
    });
    const html = renderToStaticMarkup(createElement(CoachMarkHost, { sequence }));
    expect(html).toContain("data-coach-mark-host");
    expect(html).toContain('data-coach-mark="intro"');
    expect(html).toContain("Hello");
  });

  test("renders nothing once the tour is complete", () => {
    const sequence = createCoachMarkSequence({ steps: [{ id: "a", title: "A" }], now: () => 0 });
    sequence.skipAll();
    const html = renderToStaticMarkup(createElement(CoachMarkHost, { sequence }));
    expect(html).toBe("");
  });
});
