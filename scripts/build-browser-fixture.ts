/**
 * Bundle one browser test fixture to stdout (`buildBrowserFixture` in `browser-lib.ts`). It is
 * `bun build --target=browser` plus the one Vite convention engine source uses that Bun's bundler
 * lacks: an `?url` import (the bundled Draco and Basis decoders, `decoderFiles.ts`) becomes the
 * imported file's path, which a fixture never fetches.
 *
 *   bun scripts/build-browser-fixture.ts <entry>
 */
import { argv } from "node:process";

const entry = argv[2];
if (entry === undefined) {
  console.error("usage: bun scripts/build-browser-fixture.ts <entry>");
  process.exit(2);
}

const result = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  plugins: [
    {
      name: "vite-url-imports",
      setup(build) {
        build.onResolve({ filter: /\?url$/ }, (args) => ({ path: args.path.slice(0, -"?url".length), namespace: "url-import" }));
        build.onLoad({ filter: /.*/, namespace: "url-import" }, (args) => ({ contents: `export default ${JSON.stringify(args.path)};`, loader: "js" }));
      },
    },
  ],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const output of result.outputs) process.stdout.write(await output.text());
