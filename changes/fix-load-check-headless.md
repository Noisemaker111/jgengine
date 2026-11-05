bun run shoot --load runs headless by default, so no jgengine capture opens a Chrome window unless --headed is passed; headless Chrome on Windows still renders on the real GPU.

Root cause: the load check was the one capture that opened a real Chrome window by default, one per game per run, which can take focus from a game being played on the same PC.

Prevention: load-check.test.ts fails if the default is headed again.

### Fixed

- bun run shoot --load runs headless by default, so no jgengine capture opens a Chrome window unless --headed is passed; headless Chrome on Windows still renders on the real GPU.
