import { describe, expect, test } from "bun:test";

import { devtools } from "../devtools/devtools";
import { seededRng } from "../random/rng";
import { createGameSave, GAME_SAVE_VERSION, type GameSaveDocument, type GameSaveSystem } from "./gameSave";
import { memorySaveBackend, type SaveBackend, type SaveTimers } from "./saveStore";

/** A recording backend so a test can assert what was written without a real store. */
function recordingBackend(seed: Record<string, string> = {}) {
  const cells = new Map<string, string>(Object.entries(seed));
  const writes: string[] = [];
  const backend: SaveBackend = {
    read: (key) => Promise.resolve(cells.get(key) ?? null),
    write: (key, value) => {
      cells.set(key, value);
      writes.push(key);
      return Promise.resolve();
    },
    remove: (key) => {
      cells.delete(key);
      return Promise.resolve();
    },
  };
  return { backend, cells, writes, dataWrites: () => writes.filter((key) => !key.endsWith(":__slots__")) };
}

function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  const timers: SaveTimers = {
    set: (handler) => {
      const id = next++;
      pending.set(id, handler);
      return id;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  return {
    timers,
    pending: () => pending.size,
    fire: () => {
      const handlers = [...pending.values()];
      pending.clear();
      for (const handler of handlers) handler();
    },
  };
}

function counterSystem(name: string) {
  let value = 0;
  const system: GameSaveSystem<{ value: number }> = {
    name,
    snapshot: () => ({ value }),
    restore: (next) => {
      value = next.value;
    },
    reset: () => {
      value = 0;
    },
  };
  return {
    system,
    read: () => value,
    bump: () => {
      value += 1;
    },
  };
}

describe("createGameSave — document and metadata", () => {
  test("capture stamps game, time, playtime, version and a section per system", () => {
    const a = counterSystem("alpha");
    const b = counterSystem("beta");
    let clock = 42;
    let playtime = 7;
    const save = createGameSave({
      backend: memorySaveBackend(),
      game: "demo",
      systems: [a.system, b.system],
      clock: () => clock,
      playtime: () => playtime,
      now: () => 1_000,
    });
    a.bump();
    const document = save.capture();
    expect(document.game).toBe("demo");
    expect(document.version).toBe(GAME_SAVE_VERSION);
    expect(document.savedAt).toBe(1_000);
    expect(document.time).toBe(42);
    expect(document.playtime).toBe(7);
    expect(document.rng).toBeNull();
    expect(Object.keys(document.systems).sort()).toEqual(["alpha", "beta"]);
    expect(document.systems["alpha"]).toEqual({ value: 1 });
    clock = 43;
    playtime = 8;
    expect(save.capture().time).toBe(43);
  });

  test("a duplicate system name is refused", () => {
    const first = counterSystem("same");
    const second = counterSystem("same");
    expect(() =>
      createGameSave({ backend: memorySaveBackend(), game: "demo", systems: [first.system, second.system] }),
    ).toThrow(/already registered/);
  });

  test("a devtools probe reports the slot, status and system count, and dispose drops it", () => {
    const counter = counterSystem("score");
    const save = createGameSave({
      backend: memorySaveBackend(),
      game: "demo",
      systems: [counter.system],
      devtoolsName: "game-save-test",
    });
    const line = String(devtools.snapshot().probes["game-save-test"]);
    expect(line).toContain("default");
    expect(line).toContain("idle");
    expect(line).toContain("1 systems");
    save.dispose();
    expect(devtools.snapshot().probes["game-save-test"]).toBeUndefined();
  });
});

describe("createGameSave — slots", () => {
  test("named slots keep independent documents and switchSlot flushes the current one", async () => {
    const counter = counterSystem("score");
    const save = createGameSave({ backend: memorySaveBackend(), game: "demo", systems: [counter.system] });
    counter.bump();
    await save.save(); // "default" holds 1
    expect(save.slot()).toBe("default");

    await save.switchSlot("hardcore");
    expect(counter.read()).toBe(0);
    counter.bump();
    counter.bump();
    await save.save(); // "hardcore" holds 2

    expect((await save.slots()).sort()).toEqual(["default", "hardcore"]);
    await save.switchSlot("default");
    expect(counter.read()).toBe(1);
    await save.switchSlot("hardcore");
    expect(counter.read()).toBe(2);
  });

  test("switching slots flushes unsaved work before loading the next slot", async () => {
    const counter = counterSystem("score");
    const save = createGameSave({ backend: memorySaveBackend(), game: "demo", systems: [counter.system] });
    counter.bump();
    await save.switchSlot("second"); // dirty "default" must be written first
    await save.switchSlot("default");
    expect(counter.read()).toBe(1);
  });
});

describe("createGameSave — autosave is caller policy", () => {
  test("autosave false writes only on an explicit save()", async () => {
    const recorder = recordingBackend();
    const timers = fakeTimers();
    const counter = counterSystem("score");
    const save = createGameSave({
      backend: recorder.backend,
      game: "demo",
      systems: [counter.system],
      timers: timers.timers,
      autosave: false,
    });
    counter.bump();
    save.touch();
    expect(recorder.dataWrites()).toHaveLength(0);
    expect(timers.pending()).toBe(0);
    await save.save();
    expect(recorder.dataWrites()).toHaveLength(1);
  });

  test("autosave true debounces a touch and writes once the window fires", async () => {
    const recorder = recordingBackend();
    const timers = fakeTimers();
    const counter = counterSystem("score");
    const save = createGameSave({
      backend: recorder.backend,
      game: "demo",
      systems: [counter.system],
      timers: timers.timers,
      autosave: { debounceMs: 250, maxWaitMs: 5_000 },
      now: () => 0,
    });
    counter.bump();
    save.touch();
    expect(recorder.dataWrites()).toHaveLength(0);
    expect(timers.pending()).toBe(1);
    timers.fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(recorder.dataWrites()).toHaveLength(1);
  });

  test("a maxWait ceiling forces the write while edits keep coming", async () => {
    const recorder = recordingBackend();
    const timers = fakeTimers();
    const counter = counterSystem("score");
    let now = 0;
    const save = createGameSave({
      backend: recorder.backend,
      game: "demo",
      systems: [counter.system],
      timers: timers.timers,
      autosave: { debounceMs: 250, maxWaitMs: 1_000 },
      now: () => now,
    });
    counter.bump();
    save.touch(); // schedules a debounce at t=0
    expect(recorder.dataWrites()).toHaveLength(0);
    now = 1_500;
    counter.bump();
    save.touch(); // ceiling reached — writes immediately
    await Promise.resolve();
    await Promise.resolve();
    expect(recorder.dataWrites()).toHaveLength(1);
  });
});

describe("createGameSave — migration", () => {
  test("an older payload migrates and loads", async () => {
    const legacy: GameSaveDocument = {
      version: 1,
      game: "demo",
      savedAt: 5,
      time: 12,
      playtime: 3,
      rng: null,
      systems: { legacy: { score: 7 } },
    };
    const recorder = recordingBackend({
      "game-save:demo:default": JSON.stringify({ version: 1, savedAt: 5, value: legacy }),
    });
    const counter = counterSystem("modern");
    const save = createGameSave({
      backend: recorder.backend,
      game: "demo",
      version: 2,
      systems: [counter.system],
      migrate: (document) => {
        const old = document as GameSaveDocument;
        return { ...old, version: 2, systems: { modern: { value: (old.systems["legacy"] as { score: number }).score } } };
      },
    });
    const document = await save.load();
    expect(document.version).toBe(2);
    expect(counter.read()).toBe(7);
  });

  test("a pre-versioned raw payload (no envelope) is handed to migrate as version 0", async () => {
    const raw = { systems: { legacy: { score: 3 } } };
    const recorder = recordingBackend({ "game-save:demo:default": JSON.stringify(raw) });
    const counter = counterSystem("modern");
    const save = createGameSave({
      backend: recorder.backend,
      game: "demo",
      version: 2,
      systems: [counter.system],
      migrate: (document, fromVersion) => {
        expect(fromVersion).toBe(0);
        const old = document as { systems: { legacy: { score: number } } };
        return {
          version: 2,
          game: "demo",
          savedAt: 0,
          time: 0,
          playtime: 0,
          rng: null,
          systems: { modern: { value: old.systems.legacy.score } },
        };
      },
    });
    await save.load();
    expect(counter.read()).toBe(3);
  });
});

describe("createGameSave — failures and digest", () => {
  test("a rejected backend write surfaces as error status and never throws", async () => {
    const failures: unknown[] = [];
    const backend: SaveBackend = {
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error("quota exceeded")),
      remove: () => Promise.resolve(),
    };
    const counter = counterSystem("score");
    const save = createGameSave({
      backend,
      game: "demo",
      systems: [counter.system],
      onError: (error) => failures.push(error),
    });
    counter.bump();
    await save.save();
    expect(save.status()).toBe("error");
    expect(failures).toHaveLength(1);
  });

  test("the digest covers every registered system and is stable across save and load", async () => {
    const backend = memorySaveBackend();
    const first = counterSystem("alpha");
    const second = counterSystem("beta");
    const rng = seededRng("digest-seed");
    const clock = 100;
    const save = createGameSave({
      backend,
      game: "demo",
      systems: [first.system, second.system],
      rng: { seed: "digest-seed", stream: rng },
      clock: () => clock,
      now: () => 0,
    });
    first.bump();
    second.bump();
    second.bump();
    rng();
    rng();
    const before = save.digest();
    expect(Object.keys(save.digests()).sort()).toEqual(["alpha", "beta"]);
    await save.save();

    const reloadedFirst = counterSystem("alpha");
    const reloadedSecond = counterSystem("beta");
    const reloaded = createGameSave({
      backend,
      game: "demo",
      systems: [reloadedFirst.system, reloadedSecond.system],
      rng: { seed: "digest-seed", stream: seededRng("digest-seed") },
      clock: () => clock,
      now: () => 0,
    });
    await reloaded.load();
    expect(reloadedFirst.read()).toBe(1);
    expect(reloadedSecond.read()).toBe(2);
    expect(reloaded.digest()).toBe(before);
    expect(reloaded.digests()).toEqual(save.digests());
  });

  test("the shared RNG seed and cursor survive the save", async () => {
    const backend = memorySaveBackend();
    const counter = counterSystem("score");
    const rng = seededRng("world-seed");
    const save = createGameSave({
      backend,
      game: "demo",
      systems: [counter.system],
      rng: { seed: "world-seed", stream: rng },
    });
    for (let i = 0; i < 3; i += 1) rng();
    counter.bump();
    await save.save();
    const afterSave = rng();

    const reloadedCounter = counterSystem("score");
    const reloadedRng = seededRng("world-seed");
    const reloaded = createGameSave({
      backend,
      game: "demo",
      systems: [reloadedCounter.system],
      rng: { seed: "world-seed", stream: reloadedRng },
    });
    await reloaded.load();
    expect(reloadedCounter.read()).toBe(1);
    expect(reloadedRng()).toBe(afterSave);
    expect([reloadedRng(), reloadedRng()]).toEqual([rng(), rng()]);
  });

  test("a document written by another world seed reports a mismatch and leaves the stream alone", async () => {
    const backend = memorySaveBackend();
    const counter = counterSystem("score");
    const writer = createGameSave({
      backend,
      game: "demo",
      systems: [counter.system],
      rng: { seed: "seed-a", stream: seededRng("seed-a") },
    });
    await writer.save();

    const errors: unknown[] = [];
    const otherCounter = counterSystem("score");
    const otherRng = seededRng("seed-b");
    const other = createGameSave({
      backend,
      game: "demo",
      systems: [otherCounter.system],
      rng: { seed: "seed-b", stream: otherRng },
      onError: (error) => errors.push(error),
    });
    await other.load();
    expect(errors).toHaveLength(1);
    const fresh = seededRng("seed-b");
    expect(otherRng()).toBe(fresh());
  });
});
