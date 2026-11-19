import { describe, test } from "bun:test";
import { saveBackendContract, storageHarness } from "@jgengine/core/save/saveBackendContract";

import { recordBackend } from "./save";

describe("Deepward's record backend", () => {
  for (const check of saveBackendContract(storageHarness((storage) => recordBackend(storage)))) test(check.name, check.run);
});
