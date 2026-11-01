import { join } from "node:path";

// three 0.186+ ships `three.cjs` as a shim that requires the ES module build. fiber, drei and maath still load
// three through `require()`, which Bun refuses while another test file is importing the same module
// asynchronously. Importing three once before any test file loads leaves it evaluated, so those requires resolve.
// three is not hoisted to the root, so it is resolved from the core package that declares it.
await import(Bun.resolveSync("three", join(import.meta.dir, "..", "packages", "core")));
