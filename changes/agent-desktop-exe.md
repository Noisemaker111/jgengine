`jgengine desktop` now turns any game into a Windows `.exe` that runs: it draws the app icon itself, lets the game's WebAssembly and in-memory assets load, and leaves the game and its installer next to each other.

### Fixed

- `jgengine desktop` no longer fails after compiling Rust: it generates `icon.ico` and every PNG size Tauri needs from the game's `public/icon.png`, `icon.png`, `public/cover.png` or `cover.png` (centre-cropped), or from the jgengine mark when the game has none. `--icon` takes any PNG; an unreadable one is an error, an unreadable project icon falls back to the mark with a warning.
- The desktop window's content policy allows WebAssembly (`'wasm-unsafe-eval'`) and `data:`/`blob:` fetches, so games that load physics, decoders or embedded model data no longer hang on "Preparing scene".

### Changed

- The output is `<staging>/<Name>.exe` (runs without installing) plus `<staging>/<Name>_<version>_x64-setup.exe`.
- Every game shares one cargo target directory (`CARGO_TARGET_DIR`, default `%LOCALAPPDATA%/jgengine/desktop-target`), and Tauri's build-time asset compression is off, so only the first build compiles Tauri and later games compile only their own small crate.
