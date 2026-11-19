import { describe, test } from "bun:test";

import { saveBackendContract, storageHarness, type SaveBackendHarness } from "./saveBackendContract";
import { localSaveBackend, memorySaveBackend, type SaveBackend } from "./saveStore";

type Faults = { read: number; write: number };

/** Memory never fails by itself, so its faults are injected one layer up, over the same map. */
function memoryHarness(): SaveBackendHarness {
  const faults: Faults = { read: 0, write: 0 };
  let inner = memorySaveBackend();
  const refusing = (backend: SaveBackend): SaveBackend => ({
    read: (key) => (faults.read > 0 ? (faults.read -= 1, Promise.reject(new Error("read refused"))) : backend.read(key)),
    write: (key, value) => (faults.write > 0 ? (faults.write -= 1, Promise.reject(new Error("write refused"))) : backend.write(key, value)),
    remove: (key) => backend.remove(key),
    keys: (prefix) => backend.keys(prefix),
  });
  return {
    open() {
      inner = memorySaveBackend();
      return refusing(inner);
    },
    reopen: () => refusing(inner),
    failNext: (operation) => void (faults[operation] += 1),
  };
}

for (const [name, harness] of [
  ["local", () => storageHarness((storage) => localSaveBackend(storage))],
  ["memory", memoryHarness],
] as const) {
  describe(`${name} save backend`, () => {
    for (const check of saveBackendContract(harness())) test(check.name, check.run);
  });
}

describe("local save backend without storage", () => {
  test("every operation rejects instead of pretending to keep the save", async () => {
    const backend = localSaveBackend(null);
    for (const attempt of [backend.read("k"), backend.write("k", "v"), backend.remove("k"), backend.keys("k")]) {
      let rejected = false;
      await attempt.catch(() => (rejected = true));
      if (!rejected) throw new Error("an operation on missing storage resolved");
    }
  });
});
