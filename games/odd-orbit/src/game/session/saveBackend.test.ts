import { describe, test } from "bun:test";
import { saveBackendContract, storageHarness } from "@jgengine/core/save/saveBackendContract";

import { orbitSaveBackend } from "./save";

describe("Odd Orbit's household backend", () => {
  for (const check of saveBackendContract(storageHarness((storage) => orbitSaveBackend(storage, () => {})))) test(check.name, check.run);
});
