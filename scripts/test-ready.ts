/**
 * `bun test` in a tree made by a plain `git worktree add` failed on the first
 * import ("Cannot find module") instead of saying the checkout was never set up.
 * bunfig's `[test] preload` puts the same readiness rule in front of every test
 * process: link from the main checkout, or fail with the exact command.
 *
 * In the main checkout this is a handful of stats.
 */
import { ensureLaneReadyOrExit } from "./worktree-ready";

ensureLaneReadyOrExit("test");
