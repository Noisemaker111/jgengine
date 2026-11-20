// One Chromium per test process for each set of launch flags. Bun runs a lane's test files one after
// another in one process, and each file used to launch and close its own browser: 33 browser test
// files meant 33+ cold Chromium starts per run, several at once across lanes, and that is where the
// flakes lived (#3198: a browser that died before its first navigation, a GPU process that dropped its
// device, a profile that never published its debugger port). A file now borrows the process's browser
// and its `close()` closes only the contexts and pages that file opened.
import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { findChromeExecutable } from "./browser-lib";

const launched = new Map<string, Promise<Browser>>();

function launch(args: readonly string[]): Promise<Browser> {
  const key = JSON.stringify(args);
  let browser = launched.get(key);
  if (browser === undefined) {
    browser = chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: [...args] });
    // A launch that failed is not kept, so the next file launches afresh.
    browser.catch(() => launched.delete(key));
    launched.set(key, browser);
  }
  return browser;
}

process.once("beforeExit", () => {
  for (const browser of launched.values()) void browser.then((b) => b.close()).catch(() => {});
  launched.clear();
});

/**
 * The process's Chromium for `args`, as this file's own: everything it opens through the returned
 * browser (`newPage`, `newContext`) closes with its `close()`, and the browser stays up for the next file.
 */
export async function sharedChromium(args: readonly string[] = ["--no-sandbox"]): Promise<Browser> {
  const browser = await launch(args);
  if (!browser.isConnected()) {
    launched.delete(JSON.stringify(args));
    return sharedChromium(args);
  }
  const mine = new Set<BrowserContext>();
  return new Proxy(browser, {
    get(target, property, receiver) {
      if (property === "newContext") {
        return async (...options: Parameters<Browser["newContext"]>) => {
          const context = await target.newContext(...options);
          mine.add(context);
          return context;
        };
      }
      if (property === "newPage") {
        return async (...options: Parameters<Browser["newPage"]>) => {
          const page = await target.newPage(...options);
          mine.add(page.context());
          return page;
        };
      }
      if (property === "close") {
        return async () => {
          await Promise.all([...mine].map((context) => context.close().catch(() => {})));
          mine.clear();
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
