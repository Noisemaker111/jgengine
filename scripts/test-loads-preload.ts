// Records which repository source files each test file loads, for verify:fast's test selection
// (`runtimeReach` in verify-fast.ts). A test's behaviour can change only through code it runs, and
// the runtime loads far less than the import graph names: type-only imports vanish, and most of an
// engine change's 1,200 statically reached tests never load the changed file. Active only when
// verify:fast sets JG_TEST_LOADS to a folder. `bun test --parallel` gives each test file a fresh
// module registry and starts it by loading the test file itself, so every load belongs to the test
// file loaded last in that process.
import { plugin } from "bun";
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env["JG_TEST_LOADS"];

if (dir !== undefined && dir !== "") {
  mkdirSync(dir, { recursive: true });
  // One file per process, written as each load happens: the parallel workers write at once, and a
  // worker that ends fires no exit handler to flush a buffer.
  const log = join(dir, `${process.pid}.log`);
  const root = process.cwd();
  let current = "";
  plugin({
    name: "jg-test-loads",
    setup(build) {
      // Only the repository's own folders: a filter cannot skip a file it matched (an onLoad must
      // return contents) and has no lookahead, and a dependency loaded through here loses Bun's
      // CommonJS handling (a default import of a CommonJS package failed).
      const own = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git");
      const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const filter = new RegExp(`^${escape(root)}[\\\\/](?:${own.map((entry) => escape(entry.name)).join("|")})[\\\\/].*\\.[cm]?[jt]sx?$`, "i");
      build.onLoad({ filter }, (args) => {
        if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(args.path)) current = args.path;
        if (current !== "") appendFileSync(log, `${current}\t${args.path}\n`);
        const loader = /\.[cm]?tsx$/.test(args.path) ? "tsx" : /\.[cm]?ts$/.test(args.path) ? "ts" : /x$/.test(args.path) ? "jsx" : "js";
        return { contents: readFileSync(args.path, "utf8"), loader };
      });
    },
  });
}
