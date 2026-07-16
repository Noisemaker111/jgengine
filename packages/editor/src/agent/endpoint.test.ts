import { describe, expect, test } from "bun:test";

import {
  createDefaultAgentEndpoint,
  createHttpAgentEndpoint,
  createLocalAgentEndpoint,
  EDITOR_AGENT_KEY_ENV,
  EDITOR_AGENT_KEY_FALLBACK_ENV,
  EDITOR_AGENT_URL_ENV,
  interpretLocalCommand,
  resolveAgentEndpointConfig,
} from "./endpoint";
import type { AgentEditorContext } from "./context";

const emptyContext: AgentEditorContext = {
  gameId: "g",
  mode: "edit",
  selection: ["m1"],
  focus: null,
  canUndo: true,
  canRedo: false,
  summary: { markers: 1, volumes: 0, paths: 0, annotations: 0 },
};

describe("resolveAgentEndpointConfig", () => {
  test("reads URL and key env vars", () => {
    const config = resolveAgentEndpointConfig({
      [EDITOR_AGENT_URL_ENV]: " https://agent.example/v1 ",
      [EDITOR_AGENT_KEY_ENV]: " secret ",
    });
    expect(config.url).toBe("https://agent.example/v1");
    expect(config.apiKey).toBe("secret");
  });

  test("falls back to ANTHROPIC_API_KEY", () => {
    const config = resolveAgentEndpointConfig({
      [EDITOR_AGENT_KEY_FALLBACK_ENV]: "anthropic-key",
    });
    expect(config.apiKey).toBe("anthropic-key");
    expect(config.url).toBeUndefined();
  });
});

describe("interpretLocalCommand", () => {
  test("status emits editor_status tool call", () => {
    const reply = interpretLocalCommand("/status", emptyContext);
    expect(reply.toolCalls?.[0]?.name).toBe("editor_status");
  });

  test("move emits set_transform with coordinates", () => {
    const reply = interpretLocalCommand("move boss 1 2 3", emptyContext);
    expect(reply.toolCalls).toEqual([
      { id: "local_move", name: "set_transform", arguments: { id: "boss", x: 1, y: 2, z: 3 } },
    ]);
  });

  test("select emits select with ids", () => {
    const reply = interpretLocalCommand("/select a b", emptyContext);
    expect(reply.toolCalls?.[0]).toEqual({
      id: "local_select",
      name: "select",
      arguments: { ids: ["a", "b"] },
    });
  });

  test("undo respects canUndo", () => {
    const yes = interpretLocalCommand("undo", emptyContext);
    expect(yes.toolCalls?.[0]?.name).toBe("undo");
    const no = interpretLocalCommand("undo", { ...emptyContext, canUndo: false });
    expect(no.toolCalls).toBeUndefined();
  });
});

describe("createHttpAgentEndpoint", () => {
  test("POSTs chat payload and normalizes tool calls", async () => {
    const seen: { url: string; body: unknown; auth?: string }[] = [];
    const endpoint = createHttpAgentEndpoint({
      url: "https://agent.example/chat",
      apiKey: "k",
      fetchImpl: (async (url, init) => {
        seen.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
          auth: (init?.headers as Record<string, string>)?.authorization,
        });
        return new Response(
          JSON.stringify({
            message: "done",
            toolCalls: [{ id: "x", name: "scene_summary", arguments: {} }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const reply = await endpoint.chat({
      messages: [{ role: "user", content: "summarize" }],
      context: emptyContext,
      tools: [],
    });
    expect(reply.message).toBe("done");
    expect(reply.toolCalls?.[0]?.name).toBe("scene_summary");
    expect(seen[0]?.url).toBe("https://agent.example/chat");
    expect(seen[0]?.auth).toBe("Bearer k");
    expect((seen[0]?.body as { context: AgentEditorContext }).context.gameId).toBe("g");
  });

  test("throws on non-OK HTTP", async () => {
    const endpoint = createHttpAgentEndpoint({
      url: "https://agent.example/chat",
      fetchImpl: (async () => new Response("nope", { status: 502 })) as typeof fetch,
    });
    await expect(
      endpoint.chat({ messages: [], context: emptyContext, tools: [] }),
    ).rejects.toThrow(/502/);
  });
});

describe("createDefaultAgentEndpoint", () => {
  test("local when no URL", () => {
    expect(createDefaultAgentEndpoint({}).id).toBe("local");
    expect(createLocalAgentEndpoint().id).toBe("local");
  });

  test("http when URL set", () => {
    expect(createDefaultAgentEndpoint({ url: "https://x" }).id).toBe("http");
  });
});
