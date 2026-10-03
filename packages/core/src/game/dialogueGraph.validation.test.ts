import { describe, expect, test } from "bun:test";
import { validateDialogueGraph, type DialogueGraph, type DialogueGraphNode } from "./dialogueGraph";

describe("validateDialogueGraph", () => {
  test("accepts branches, cycles with exits, and both forms of ending choice", () => {
    const graph: DialogueGraph = {
      start: "ask",
      nodes: [
        { id: "ask", text: "Ask again?", choices: [{ text: "Again", to: "ask" }, { text: "Leave", to: "bye" }] },
        { id: "bye", text: "Goodbye", choices: [{ text: "Close", to: null }, { text: "Close too" }] },
      ],
    };
    expect(validateDialogueGraph(graph)).toEqual([]);
    expect(validateDialogueGraph({ start: "end", nodes: [{ id: "end", text: "End", choices: [] }] })).toEqual([]);
  });

  test("locates duplicate ids and broken targets in the original arrays", () => {
    expect(validateDialogueGraph({
      start: "a",
      nodes: [
        { id: "a", text: "Original" },
        { id: "a", text: "Duplicate", choices: [{ text: "Leave", to: "missing" }] },
      ],
    })).toEqual([
      {
        code: "duplicate-node", severity: "error", nodeId: "a", nodeIndex: 1,
        message: 'Duplicate dialogue node "a".',
      },
      {
        code: "missing-target", severity: "error", nodeId: "a", nodeIndex: 1,
        choiceIndex: 0, targetId: "missing",
        message: 'Dialogue choice targets unknown node "missing".',
      },
    ]);
  });

  test("reports a missing start without flooding nodes with unreachable warnings", () => {
    expect(validateDialogueGraph({ start: "missing", nodes: [{ id: "a", text: "End" }] })).toEqual([
      { code: "missing-start", severity: "error", targetId: "missing", message: 'Dialogue start "missing" does not exist.' },
    ]);
    expect(validateDialogueGraph({ start: "missing", nodes: [] })[0]?.code).toBe("missing-start");
  });

  test("finds unreachable nodes and every node leading into a closed loop", () => {
    const graph: DialogueGraph = {
      start: "start",
      nodes: [
        { id: "start", text: "Choose", choices: [{ text: "Trap", to: "a" }, { text: "Leave" }] },
        { id: "a", text: "A", choices: [{ text: "B", to: "b" }] },
        { id: "b", text: "B", choices: [{ text: "A", to: "a" }] },
        { id: "feeder", text: "Into the trap", choices: [{ text: "A", to: "a" }] },
        { id: "unused", text: "Unused ending" },
      ],
    };
    expect(validateDialogueGraph(graph).map(({ code, nodeId, severity }) => [code, nodeId, severity])).toEqual([
      ["no-exit", "a", "warning"],
      ["no-exit", "b", "warning"],
      ["unreachable-node", "feeder", "warning"],
      ["no-exit", "feeder", "warning"],
      ["unreachable-node", "unused", "warning"],
    ]);
  });

  test("does not treat a dangling target as a valid ending", () => {
    expect(validateDialogueGraph({
      start: "a",
      nodes: [{ id: "a", text: "A", choices: [{ text: "Broken", to: "unknown" }] }],
    }).map(({ code }) => code)).toEqual(["missing-target", "no-exit"]);
  });

  test("supports opaque ids and does not change authoring data", () => {
    const graph: DialogueGraph = {
      start: "__proto__",
      nodes: [
        { id: "__proto__", text: "Start", choices: [{ text: "Finish", to: "" }] },
        { id: "", text: "End" },
      ],
    };
    const before = JSON.stringify(graph);
    for (const node of graph.nodes) {
      if (node.choices) Object.freeze(node.choices);
      Object.freeze(node);
    }
    Object.freeze(graph.nodes);
    Object.freeze(graph);
    expect(validateDialogueGraph(graph)).toEqual([]);
    expect(validateDialogueGraph(graph)).toEqual([]);
    expect(JSON.stringify(graph)).toBe(before);
  });

  test("traverses a deep chapter without recursive stack limits", () => {
    const nodes: DialogueGraphNode[] = Array.from({ length: 30_000 }, (_, i) => ({
      id: String(i), text: "Line",
      choices: i === 29_999 ? undefined : [{ text: "Continue", to: String(i + 1) }],
    }));
    expect(validateDialogueGraph({ start: "0", nodes })).toEqual([]);
    nodes[29_999]!.choices = [{ text: "Repeat", to: "0" }];
    const issues = validateDialogueGraph({ start: "0", nodes });
    expect(issues).toHaveLength(nodes.length);
    expect(issues.every(({ code }) => code === "no-exit")).toBe(true);
  });
});
