import { join } from "node:path";

// three 0.186+ ships `three.cjs` as a shim that requires the ES module build. fiber, drei and maath still load
// three through `require()`, which Bun refuses while another test file is importing the same module
// asynchronously. Importing three once before any script or test file loads leaves it evaluated, so those requires
// resolve; bunfig.toml preloads this for every bun run and every bun test started at the root. Bun reads bunfig.toml
// only from the folder it starts in, so the CLI package's `test` script, which Windows CI runs, passes --preload itself.
// three is not hoisted to the root, so it is resolved from the core package that declares it.
// Bun also runs this preload for `bun install`, so a checkout with nothing installed yet must get past it.
const three = resolveThree();
if (three !== null) await import(three);

function resolveThree(): string | null {
  try {
    return Bun.resolveSync("three", join(import.meta.dir, "..", "packages", "core"));
  } catch {
    return null;
  }
}
