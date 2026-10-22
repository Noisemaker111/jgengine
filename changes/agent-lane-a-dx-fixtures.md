### Fixed

- `settingsBoundary.test.ts` builds its fixture under `.scratch/` inside the checkout instead of `%TEMP%`, so `@jgengine/*` resolves through the workspace and the browser test passes in a fresh worktree with no `dist`; CI was hiding this because it builds first.
- The skill installer treats an unreadable `.jgengine-version.json` as missing and says which file it ignored, so a half-written or hand-edited marker is rewritten on the next install instead of blocking it; refusal messages now name the metadata file.
- Skill and doctor fixtures write a realistic next-minor version instead of `99.0.0`, so the CI log no longer reports impossible install versions.
- `SettingsMenu` keeps Escape closing the dialog while a keybind capture is ending. The capture already consumes Escape at the window, so the extra "wait for capture state" guard only dropped a close request that arrived before the next render, which failed `touchHudReachability` on every `beta` run since #2100.
