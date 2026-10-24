### Fixed

- `bun run shoot` refuses a scene shot whose page has no 3D canvas, and scores rendered geometry inside the canvas region before writing the file. `bun run shoot <game> --view <name>` defaults to `--mode ui`, which renders the game's HUD preview over a CSS backdrop and creates no canvas; the whole-frame flat test was skipped without a region and the backdrop's full-screen paint withheld the viewport verdict, so a HUD-only frame was written with exit 0.
