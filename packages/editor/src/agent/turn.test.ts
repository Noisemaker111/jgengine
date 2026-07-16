import { describe, expect, test } from "bun:test";

import { createEditorHost } from "../session";
import type { AgentEndpoint } from "./endpoint";
import { runAgentTurn, undoAgentPatch } from "./turn";

describe("runAgentTurn", () => {
  test("injects context, routes tool calls, records patches", async () => {
    const { api, dispose } = createEditorHost({
      gameId: "turn",
      layers: {
        markers: [{ id: "prop", kind: "prop", position: { x: 0, y: 0, z: 0 } }],
      },
    });

    const endpoint: AgentEndpoint = {
      id: "scripted",
      async chat(request) {
        expect(request.context.gameId).toBe("turn");
        expect(request.tools.length).toBeGreaterThan(0);
        const last = request.messages[request.messages.length - 1];
        if (last?.role === "user") {
          return {
            message: "Moving prop.",
            toolCalls: [{ id: "c1", name: "set_transform", arguments: { id: "prop", x: 4, y: 0, z: 5 } }],
          };
        }
        return { message: "Done." };
      },
    };

    const turn = await runAgentTurn({
      api,
      endpoint,
      history: [],
      userMessage: "nudge the prop",
      now: () => 1000,
    });

    expect(turn.transcript.some((e) => e.kind === "user" && e.content === "nudge the prop")).toBe(true);
    expect(turn.transcript.some((e) => e.kind === "assistant" && e.content === "Moving prop.")).toBe(true);
    expect(turn.patches).toHaveLength(1);
    expect(turn.patches[0]?.method).toBe("set_transform");
    expect(turn.patches[0]?.undone).toBe(false);

    const marker = api.getSession().getState().document.markers.find((m) => m.id === "prop");
    expect(marker?.position).toEqual({ x: 4, y: 0, z: 5 });
    expect(api.getSession().canUndo()).toBe(true);

    dispose();
  });

  test("undoAgentPatch reverses the top agent edit", async () => {
    const { api, dispose } = createEditorHost({
      gameId: "turn",
      layers: {
        markers: [{ id: "prop", kind: "prop", position: { x: 0, y: 0, z: 0 } }],
      },
    });

    let calls = 0;
    const endpoint: AgentEndpoint = {
      id: "scripted",
      async chat() {
        calls += 1;
        if (calls === 1) {
          return {
            toolCalls: [{ id: "c1", name: "set_transform", arguments: { id: "prop", x: 7, y: 0, z: 0 } }],
          };
        }
        return { message: "ok" };
      },
    };

    const turn = await runAgentTurn({ api, endpoint, history: [], userMessage: "move" });
    expect(turn.patches).toHaveLength(1);
    const patchId = turn.patches[0]!.id;

    const undone = undoAgentPatch(api, turn.patches, patchId);
    expect(undone.ok).toBe(true);
    if (!undone.ok) throw new Error("expected undo ok");
    expect(undone.patches[0]?.undone).toBe(true);

    const marker = api.getSession().getState().document.markers.find((m) => m.id === "prop");
    expect(marker?.position).toEqual({ x: 0, y: 0, z: 0 });

    const again = undoAgentPatch(api, undone.patches, patchId);
    expect(again.ok).toBe(false);

    dispose();
  });

  test("refuses undoing a non-top patch", async () => {
    const { api, dispose } = createEditorHost({
      gameId: "turn",
      layers: {
        markers: [
          { id: "a", kind: "prop", position: { x: 0, y: 0, z: 0 } },
          { id: "b", kind: "prop", position: { x: 1, y: 0, z: 0 } },
        ],
      },
    });

    let step = 0;
    const endpoint: AgentEndpoint = {
      id: "scripted",
      async chat() {
        step += 1;
        if (step === 1) {
          return {
            toolCalls: [
              { id: "c1", name: "set_transform", arguments: { id: "a", x: 2, y: 0, z: 0 } },
              { id: "c2", name: "set_transform", arguments: { id: "b", x: 3, y: 0, z: 0 } },
            ],
          };
        }
        return {};
      },
    };

    const turn = await runAgentTurn({ api, endpoint, history: [], userMessage: "move both" });
    expect(turn.patches).toHaveLength(2);
    const first = turn.patches[0]!.id;
    const refused = undoAgentPatch(api, turn.patches, first);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected refuse");
    expect(refused.error).toContain("newer");

    dispose();
  });
});
