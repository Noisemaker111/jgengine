// Records which repository source files each test file loads, for verify:fast's test selection
// (`test-loads.ts`). A test's behaviour can change only through code it runs, and the runtime loads
// far less than the import graph names: most of an engine change's 1,200 statically reached tests
// never load the changed file. Active only when verify:fast sets JG_TEST_LOADS to a folder.
//
// It follows a test into the processes it starts: verify:fast puts this preload in BUN_OPTIONS, so
// every Bun process under a test records too, and each process's log says which process started it
// and when, so its loads belong to the test that was running then. A start it cannot see into (a
// browser, a compiler, a package script, a Worker, a bundle) marks the test opaque, and the test
// keeps the import graph's reach for it.
//
// `bun test --parallel` gives each test file a fresh module registry and starts it by loading the test
// file itself, so every load in a test process belongs to the test file loaded last.
import { plugin } from "bun";
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

const dir = process.env["JG_TEST_LOADS"];
const root = process.env["JG_TEST_LOADS_ROOT"] ?? process.cwd();

if (dir !== undefined && dir !== "") {
  mkdirSync(dir, { recursive: true });
  // One file per process, written as each event happens: the parallel workers write at once, and a
  // worker that ends fires no exit handler to flush a buffer.
  const log = `${dir}${sep}${process.pid}.log`;
  const write = (line: string): void => appendFileSync(log, `${line}\n`);
  write(`@\t${process.ppid}\t${Date.now()}`);

  /** Inside the checkout and not in its scratch folder: a path whose bytes are the repository's. */
  const inRepo = (path: string): boolean => {
    const within = relative(root, path);
    return within === "" || (!within.startsWith("..") && !isAbsolute(within) && !within.split(/[\\/]/).includes(".scratch"));
  };
  const isBun = (program: string): boolean => program === process.execPath || /^bunx?(?:\.exe)?$/i.test(basename(program));
  /**
   * A start whose loads this preload records, or that cannot read the repository: a Bun process
   * running a script file, a test or an eval, or any program working outside the checkout with no
   * repository path in its arguments (git on a fixture repo). Everything else is opaque.
   */
  const transparent = (argv: readonly string[], cwd: string): boolean => {
    const [program = "", ...args] = argv;
    if (isBun(program)) {
      const positional = args.filter((arg) => !arg.startsWith("-"));
      if (args.includes("-e") || args.includes("--eval") || positional[0] === "test") return true;
      const target = positional[0] === "run" ? positional[1] : positional[0];
      return target !== undefined && /\.[cm]?[jt]sx?$/.test(target);
    }
    return !inRepo(cwd) && !args.some((arg) => !arg.startsWith("-") && (isAbsolute(arg) || /[\\/]/.test(arg)) && inRepo(resolve(cwd, arg)));
  };
  // A child whose environment the caller replaced still records: the variables are put back.
  const recorderEnv = {
    JG_TEST_LOADS: dir,
    JG_TEST_LOADS_ROOT: root,
    BUN_OPTIONS: process.env["BUN_OPTIONS"] ?? "",
  };
  type SpawnOptions = { cmd?: string[]; cwd?: string; env?: Record<string, string | undefined> };
  const watch = <T extends (...args: never[]) => unknown>(original: T): T =>
    ((first: string[] | SpawnOptions, second?: SpawnOptions) => {
      const options = Array.isArray(first) ? second : first;
      const argv = Array.isArray(first) ? first : (first.cmd ?? []);
      if (!transparent(argv, options?.cwd ?? process.cwd())) write(`O\t${argv.join(" ")}`);
      const start = original as unknown as (a: unknown, b?: unknown) => unknown;
      if (options?.env === undefined) return start(first, second);
      const kept = { ...options, env: { ...options.env, ...recorderEnv } };
      return Array.isArray(first) ? start(first, kept) : start(kept);
    }) as unknown as T;
  // node:child_process starts its processes through these too.
  Bun.spawn = watch(Bun.spawn);
  Bun.spawnSync = watch(Bun.spawnSync);
  const build = Bun.build;
  Bun.build = ((...args: Parameters<typeof Bun.build>) => {
    write("O\tBun.build");
    return build(...args);
  }) as typeof Bun.build;
  const OriginalWorker = globalThis.Worker;
  globalThis.Worker = class extends OriginalWorker {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      write(`O\tWorker ${String(args[0])}`);
      super(...args);
    }
  };

  plugin({
    name: "jg-test-loads",
    setup(builder) {
      // Only the repository's own folders: a filter cannot skip a file it matched (an onLoad must
      // return contents) and has no lookahead, and a dependency loaded through here loses Bun's
      // CommonJS handling (a default import of a CommonJS package failed).
      const own = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git");
      const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const filter = new RegExp(`^${escape(root)}[\\\\/](?:${own.map((entry) => escape(entry.name)).join("|")})[\\\\/].*\\.[cm]?[jt]sx?$`, "i");
      builder.onLoad({ filter }, (args) => {
        if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(args.path)) write(`#\t${args.path}\t${Date.now()}`);
        write(`L\t${args.path}`);
        const loader = /\.[cm]?tsx$/.test(args.path) ? "tsx" : /\.[cm]?ts$/.test(args.path) ? "ts" : /x$/.test(args.path) ? "jsx" : "js";
        return { contents: readFileSync(args.path, "utf8"), loader };
      });
    },
  });
}
