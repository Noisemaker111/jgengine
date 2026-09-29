### Fixed

- Shell screenshots wait for mounted loading subtrees to commit and a renderer frame to complete, including cached models and texture loads; first-request idle no longer counts as readiness.
- Standalone shoot/drive consume the native rendered-frame signal instead of treating a sized canvas as ready. Both capture commands clear saved-world storage by default; `--reuse-storage` captures restore flows.
- Generated capture commands start Vite through its installed JavaScript entry on Windows, including Bun installs, and await Vite/Chrome process readiness events.
- Monorepo capture startup awaits Vite and Chrome announcements instead of polling HTTP; persistent Windows startup watches redirected output, and stale owned servers retire on connection closure.
- The native shell supplies screenshot readiness for custom hosts; monorepo `shoot --view` selects live play by default instead of rendering only preview HUD.
