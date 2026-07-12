import { describe, expect, test } from "bun:test";
import type { GameRuntimeServerView } from "@jgengine/core/runtime/transport";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";
import { attachWorldSync } from "./worldSync";

function view(revision: number, serverState: unknown): GameRuntimeServerView {
  return { serverId: "s1", gameId: "g", revision, memberUserIds: [], serverState, updatedAt: 0 };
}

describe("attachWorldSync", () => {
  test("mirrors each server-state snapshot into ctx.hydrate and ignores empty views", () => {
    let onChange: ((v: GameRuntimeServerView | null) => void) | null = null;
    let unsubscribed = false;
    const feeds = {
      subscribeServer(_serverId: string, cb: (v: GameRuntimeServerView | null) => void) {
        onChange = cb;
        return () => {
          unsubscribed = true;
        };
      },
    };
    const hydrated: WorldSnapshot[] = [];
    const cleanup = attachWorldSync(feeds, "s1", { hydrate: (s) => hydrated.push(s) });

    const first: WorldSnapshot = { entities: [{ id: "a" }], store: [["phase", "combat"]] };
    onChange!(view(1, first));
    onChange!(null); // dropped view — no hydrate
    onChange!(view(2, undefined)); // no world payload — no hydrate
    const second: WorldSnapshot = { entities: [{ id: "a" }, { id: "b" }], store: [] };
    onChange!(view(3, second));

    expect(hydrated).toEqual([first, second]);

    cleanup();
    expect(unsubscribed).toBe(true);
  });
});
