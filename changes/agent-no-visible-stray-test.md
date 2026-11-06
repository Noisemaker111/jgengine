the stray-browser sweep test no longer opens a Chrome window that takes the foreground; its planted browser now runs headless

Root cause: the test planted a real windowed Chrome at -32000,-32000; Windows still made it the foreground window for about 1.5 s on every verify:fast run that reached browser-lib.test.ts, pulling focus from a game

### Fixed

- the stray-browser sweep test no longer opens a Chrome window that takes the foreground; its planted browser now runs headless
