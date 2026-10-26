### Fixed

- Desktop Standalone start runs `bun --cwd=games/<id> run dev` instead of the `games:<id>` root script that #2505 removed, so every start failed.
- `jgengine create` in the monorepo no longer adds a `games:<id>` root script; its next steps print `bun --cwd=games/<folder> run dev`.

Context: the launcher and `create` still called a root script that no longer exists, and their tests pinned that name, so they kept passing.

Root cause: #2505 removed the `games:<id>` root scripts without checking the desktop launcher's argv, and the launcher's test asserted that same argv.

Verification:
- `bun test packages/jgengine/src/create.test.ts apps/desktop/project/commands.test.ts`: 23 pass, 0 fail.
- `bun --cwd=games/harbor-heat run dev`, the argv `buildShellCommand` builds for Standalone: serves `http://localhost:5173/` with 200, title "Harbor Heat", and `#root`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
