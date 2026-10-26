import { describe, expect, test } from "bun:test";

import { createDialogueRun, selectDialogueView, type DialogueGraph } from "./dialogueGraph";

const graph: DialogueGraph = {
  start: "greet",
  nodes: [
    {
      id: "greet",
      speaker: "Marco",
      speakerKind: "merchant",
      portrait: "marco.png",
      text: "New in town?",
      choices: [
        { text: "Just passing through.", to: "wares", kind: "neutral" },
        { text: "None of your business.", to: "rude" },
      ],
    },
    { id: "wares", speaker: "Marco", text: "Take a look at my wares.", choices: [{ text: "Maybe later.", to: null }] },
    { id: "rude", speaker: "Marco", text: "Suit yourself." },
  ],
};

describe("selectDialogueView", () => {
  test("projects a node to a render-ready view", () => {
    const view = selectDialogueView(graph, "greet");
    expect(view).not.toBeNull();
    expect(view?.speaker).toBe("Marco");
    expect(view?.speakerKind).toBe("merchant");
    expect(view?.portrait).toBe("marco.png");
    expect(view?.text).toBe("New in town?");
    expect(view?.choices).toHaveLength(2);
    expect(view?.done).toBe(false);
  });

  test("marks a choiceless node done", () => {
    expect(selectDialogueView(graph, "rude")?.done).toBe(true);
  });

  test("returns null for an unknown node id", () => {
    expect(selectDialogueView(graph, "nope")).toBeNull();
  });
});

describe("createDialogueRun", () => {
  test("opens on the graph start node", () => {
    const run = createDialogueRun(graph);
    expect(run.currentId()).toBe("greet");
    expect(run.current()?.text).toBe("New in town?");
    expect(run.hasVisited("greet")).toBe(true);
  });

  test("choose advances to the node the choice names and records visits", () => {
    const run = createDialogueRun(graph);
    const next = run.choose(0);
    expect(next?.nodeId).toBe("wares");
    expect(run.currentId()).toBe("wares");
    expect(run.hasVisited("wares")).toBe(true);
  });

  test("a terminal choice (no `to`) leaves the node in place and reports done", () => {
    const run = createDialogueRun(graph, { startAt: "wares" });
    const same = run.choose(0);
    expect(same?.nodeId).toBe("wares");
    expect(run.currentId()).toBe("wares");
  });

  test("a choiceless node is done", () => {
    const run = createDialogueRun(graph, { startAt: "rude" });
    expect(run.isDone()).toBe(true);
  });

  test("out-of-range choice index is a no-op", () => {
    const run = createDialogueRun(graph);
    expect(run.choose(99)?.nodeId).toBe("greet");
    expect(run.currentId()).toBe("greet");
  });

  test("subscribe fires on advance; reset returns to start", () => {
    const run = createDialogueRun(graph);
    let bumps = 0;
    const off = run.subscribe(() => {
      bumps += 1;
    });
    run.choose(1);
    expect(run.currentId()).toBe("rude");
    expect(bumps).toBe(1);
    run.reset();
    expect(run.currentId()).toBe("greet");
    expect(bumps).toBe(2);
    off();
    run.goTo("wares");
    expect(bumps).toBe(2);
  });

  test("snapshot/restore round-trips current node and visited history", () => {
    const run = createDialogueRun(graph);
    run.choose(0);
    const snap = run.snapshot();
    expect(snap.nodeId).toBe("wares");
    expect(snap.visited).toEqual(["greet", "wares"]);

    const restored = createDialogueRun(graph);
    restored.restore(snap);
    expect(restored.currentId()).toBe("wares");
    expect(restored.hasVisited("greet")).toBe(true);
  });
});
