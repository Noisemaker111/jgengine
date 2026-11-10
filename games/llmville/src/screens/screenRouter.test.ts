import { describe, expect, test } from "bun:test";

import {
  createScreenRouter,
  matchScreenPath,
  parseScreenHref,
  screenHref,
  type ScreenAddress,
} from "./screenRouter";

function fakeAddress(start: string) {
  let href = start;
  let onChange = () => undefined as void;
  const writes: string[] = [];
  const address: ScreenAddress = {
    read: () => href,
    write(next, mode) {
      href = next;
      writes.push(`${mode} ${next}`);
    },
    linkFor: (next) => `?game=llmville&screen=${next}`,
    listen(listener) {
      onChange = listener;
      return () => {
        onChange = () => undefined;
      };
    },
  };
  return {
    address,
    writes,
    browserGoes(next: string) {
      href = next;
      onChange();
    },
  };
}

describe("screen addresses", () => {
  test("a target fills its params and keeps only defined search values", () => {
    expect(screenHref({ to: "/game/$gameId", params: { gameId: "k1 7" } })).toBe("/game/k1%207");
    expect(screenHref({ to: "/", search: { settings: true, tab: undefined } })).toBe("/?settings=true");
    expect(screenHref({ to: "/login", search: { intent: "play" } })).toBe("/login?intent=play");
  });

  test("an address parses back to its path and typed search", () => {
    expect(parseScreenHref("/?settings=true&tab=sound")).toEqual({
      href: "/?settings=true&tab=sound",
      pathname: "/",
      search: { settings: true, tab: "sound" },
    });
    expect(parseScreenHref("/dev/").pathname).toBe("/dev");
  });

  test("a path matches its own pattern only", () => {
    expect(matchScreenPath("/game/$gameId", "/game/abc")).toEqual({ gameId: "abc" });
    expect(matchScreenPath("/game/$gameId", "/game")).toBeNull();
    expect(matchScreenPath("/game/$gameId", "/game/")).toBeNull();
    expect(matchScreenPath("/game/create", "/game/abc")).toBeNull();
    expect(matchScreenPath("/", "/")).toEqual({});
  });
});

describe("the screen stack", () => {
  test("navigating stacks a screen and writes its address; replace swaps the top", async () => {
    const browser = fakeAddress("/");
    const router = createScreenRouter();
    router.install(browser.address);
    let changes = 0;
    router.subscribe(() => {
      changes += 1;
    });

    await router.navigate({ to: "/login", search: { intent: "play" } });
    expect(router.stack()).toEqual(["/", "/login?intent=play"]);
    expect(router.location().search).toEqual({ intent: "play" });

    await router.navigate({ to: "/game/create", replace: true });
    expect(router.stack()).toEqual(["/", "/game/create"]);
    expect(browser.writes).toEqual(["push /login?intent=play", "replace /game/create"]);

    await router.navigate({ to: "/game/create" });
    expect(changes).toBe(2);
  });

  test("the browser's back button pops the stack and forward stacks again", async () => {
    const browser = fakeAddress("/");
    const router = createScreenRouter();
    router.install(browser.address);
    await router.navigate({ to: "/about" });

    browser.browserGoes("/");
    expect(router.stack()).toEqual(["/"]);
    browser.browserGoes("/about");
    expect(router.stack()).toEqual(["/", "/about"]);
    expect(router.location().pathname).toBe("/about");
  });

  test("installing an address restarts from it, and links come from it", () => {
    const router = createScreenRouter();
    const undo = router.install(fakeAddress("/dev/racks").address);
    expect(router.location().pathname).toBe("/dev/racks");
    expect(router.linkFor({ to: "/dev/hud" })).toBe("?game=llmville&screen=/dev/hud");
    undo();
    expect(router.linkFor({ to: "/dev/hud" })).toBe("/dev/hud");
  });
});
