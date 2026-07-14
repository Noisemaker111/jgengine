import { afterEach, describe, expect, test } from "bun:test";

import { defineGame, type GameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { lan, offline, p2p, ws } from "@jgengine/core/runtime/adapter";

import { resolveShellMultiplayer } from "./multiplayer";

type StubWindow = { location: { protocol: string; hostname: string } };

let capturedUrl: string | null = null;

class StubSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    capturedUrl = url;
  }
  send(): void {}
  close(): void {}
}

const originalWebSocket = globalThis.WebSocket;

function makeGame(multiplayer: unknown): GameDefinition {
  return defineGame({ name: "test-game", assets: createAssetCatalog(), multiplayer });
}

function connectedUrl(result: ReturnType<typeof resolveShellMultiplayer>): string | null {
  if (result === null) return null;
  capturedUrl = null;
  (globalThis as { WebSocket: unknown }).WebSocket = StubSocket;
  void result.backend.transport.joinServer({ gameId: "g", serverId: "s" }).catch(() => undefined);
  result.backend.close();
  return capturedUrl;
}

describe("resolveShellMultiplayer", () => {
  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
    delete (globalThis as { window?: unknown }).window;
  });

  test("ws adapter with url in config resolves that url", () => {
    const game = makeGame(ws({ url: "ws://configured.example/ws" }));
    const result = resolveShellMultiplayer({ game, gameId: "g1" });
    expect(result).not.toBeNull();
    expect(connectedUrl(result)).toBe("ws://configured.example/ws");
  });

  test("lan adapter derives the url from window location", () => {
    (globalThis as { window?: unknown }).window = {
      location: { protocol: "http:", hostname: "192.168.1.7" },
    } satisfies StubWindow;
    const game = makeGame(lan({ port: 9090 }));
    const result = resolveShellMultiplayer({ game, gameId: "g2" });
    expect(result).not.toBeNull();
    expect(connectedUrl(result)).toBe("ws://192.168.1.7:9090/ws");
  });

  test("offline adapter returns null", () => {
    const game = makeGame(offline());
    expect(resolveShellMultiplayer({ game, gameId: "g3" })).toBeNull();
  });

  test("force builds a ws backend regardless of the declared adapter", () => {
    const game = makeGame(p2p({ room: "lobby" }));
    const result = resolveShellMultiplayer({ game, gameId: "g4", force: true });
    expect(result).not.toBeNull();
    expect(connectedUrl(result)).toBe("ws://localhost:8080/ws");
  });

  test("p2p adapter warns loudly instead of silently shipping single-player", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => void warnings.push(message);
    try {
      const game = makeGame(p2p({ room: "lobby" }));
      expect(resolveShellMultiplayer({ game, gameId: "g5" })).toBeNull();
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings.some((w) => w.includes("g5") && w.includes("p2p"))).toBe(true);
  });

  test("server-authoritative ws without a url warns and falls back", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => void warnings.push(message);
    try {
      const game = makeGame(ws({ authority: "server" }));
      expect(resolveShellMultiplayer({ game, gameId: "g6" })).toBeNull();
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings.some((w) => w.includes("g6") && w.includes("authority"))).toBe(true);
  });

  test("offline stays silent — no warning", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => void warnings.push(message);
    try {
      resolveShellMultiplayer({ game: makeGame(offline()), gameId: "g7" });
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings).toEqual([]);
  });
});
