jgengine desktop --steam builds a Steam-ready Windows depot with SteamPipe build scripts, --steamworks makes the Steam overlay work over WebView2, and desktop builds get in-game Uncapped frame-rate and borderless Fullscreen choices

Engine seam: packages/jgengine/src/desktop.ts, packages/jgengine/src/desktopSteam.ts, packages/core/src/settings/desktopShell.ts, packages/core/src/settings/frameRateLimit.ts, packages/core/src/settings/settingsController.draw.ts, packages/core/src/settings/appliedSettings.draw.tsx

### Added

- jgengine desktop --steam lays out a SteamPipe build beside the app (steam/content, steam/scripts with app_build_<appid>.vdf and depot_build_<depotid>.vdf, steam/output); the app id, depot id and live branch come from package.json "jgengine": { "steam": { ... } } or --steam-app, --steam-depot and --steam-branch, and a game without an app id still builds its content and is told the id is missing
- jgengine desktop --steamworks links the Steamworks API and a transparent surface Steam's overlay can draw into, ships steam_api64.dll in the depot, and forwards Shift+Tab from the page to the overlay
- jgengine desktop --no-installer builds only the game executable
- a desktop build's Frame rate limit setting offers Match display (V-Sync) and Uncapped; the choice is saved per player and applies on the next launch, and --uncapped still forces uncapped
- a desktop build's graphics settings gain Display mode (Windowed or Fullscreen): native borderless fullscreen that survives alt-tab, applied at once and remembered for the next launch
- `readDesktopShell`, `invokeDesktop`, `saveDesktopDisplayMode`, `saveDesktopFrameRate`, `desktopPresentMode`, `syncDesktopSettings`, `DISPLAY_MODE_OPTIONS` (`@jgengine/core/settings/desktopShell`): a desktop build's launch state and its commands; the settings store follows what the shell launched with
- `FRAME_RATE_LIMIT_UNCAPPED`, `frameRateLimitOptions` (`@jgengine/core/settings/frameRateLimit`): the frame-rate choices, with the desktop-only Uncapped option
- `SETTING_IDS.graphicsDisplayMode` (`@jgengine/core/settings/settingsModel`)
- bun run perf desktop --all [--uncapped] builds every game's production desktop app, measures each in turn and prints the 360 fps table; a report, not a gate
