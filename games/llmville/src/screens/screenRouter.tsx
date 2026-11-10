import { useSyncExternalStore } from "@jgengine/core/ui/jsx";
import type { AnchorHTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";
import { menuStackReducer } from "@jgengine/core/menu/menuRouter.view";

/** Where a screen change goes: a path pattern (`/game/$gameId`), its params and its search values. */
export interface ScreenTarget {
  to: string;
  params?: Record<string, string> | undefined;
  search?: Record<string, string | boolean | undefined> | undefined;
  /** Replace the screen on top instead of stacking a new one. */
  replace?: boolean | undefined;
}

/** The screen on top: its address, its path and its parsed search values (`true`/`false` become booleans). */
export interface ScreenLocation {
  href: string;
  pathname: string;
  search: Record<string, unknown>;
}

/** The address a target resolves to: the path with its params filled in, then the defined search values. */
export function screenHref({ to, params, search }: ScreenTarget): string {
  const pathname = to.replace(/\$(\w+)/g, (_match, name: string) => encodeURIComponent(params?.[name] ?? ""));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return text === "" ? pathname : `${pathname}?${text}`;
}

export function parseScreenHref(href: string): ScreenLocation {
  const cut = href.indexOf("?");
  const rawPath = cut === -1 ? href : href.slice(0, cut);
  const trimmed = rawPath.replace(/\/+$/, "");
  const search: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(cut === -1 ? "" : href.slice(cut + 1))) {
    search[key] = value === "true" ? true : value === "false" ? false : value;
  }
  return { href, pathname: trimmed === "" ? "/" : trimmed, search };
}

/** The params a path holds for a pattern, or null when it is another screen's path. */
export function matchScreenPath(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/");
  const have = pathname.split("/");
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of want.entries()) {
    const value = have[index] ?? "";
    if (part.startsWith("$")) {
      if (value === "") return null;
      params[part.slice(1)] = decodeURIComponent(value);
    } else if (part !== value) {
      return null;
    }
  }
  return params;
}

/** Where the top screen's address is kept outside the stack: the page URL, one query value, or nowhere. */
export interface ScreenAddress {
  read(): string;
  write(href: string, mode: "push" | "replace"): void;
  /** The link a browser would open for this screen. */
  linkFor(href: string): string;
  listen(onChange: () => void): () => void;
}

function listenPopState(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** The page's own path and query: LLMville's site, where every screen has its URL. */
export function pathAddress(): ScreenAddress {
  return {
    read: () => `${window.location.pathname}${window.location.search}`,
    write(href, mode) {
      if (mode === "push") window.history.pushState(null, "", href);
      else window.history.replaceState(null, "", href);
    },
    linkFor: (href) => href,
    listen: listenPopState,
  };
}

/** One query value on a page whose path belongs to its host: the dev runner, where `?game=` picks the game. */
export function queryAddress(param = "screen"): ScreenAddress {
  const linkFor = (href: string) => {
    const query = new URLSearchParams(window.location.search);
    if (href === "/") query.delete(param);
    else query.set(param, href);
    const text = query.toString();
    return text === "" ? window.location.pathname : `${window.location.pathname}?${text}`;
  };
  return {
    read: () => new URLSearchParams(window.location.search).get(param) ?? "/",
    write(href, mode) {
      if (mode === "push") window.history.pushState(null, "", linkFor(href));
      else window.history.replaceState(null, "", linkFor(href));
    },
    linkFor,
    listen: listenPopState,
  };
}

/** Screens with no address outside the stack: tests, and a screen mounted on its own. */
export function memoryAddress(start = "/"): ScreenAddress {
  return { read: () => start, write: () => undefined, linkFor: (href) => href, listen: () => () => undefined };
}

/**
 * LLMville's screens as a stack over the engine's menu stack: navigating opens or replaces the top
 * screen, the browser's back and forward buttons walk it, and the address mirrors the top.
 */
export interface ScreenRouter {
  location(): ScreenLocation;
  stack(): readonly string[];
  navigate(target: ScreenTarget): Promise<void>;
  linkFor(target: ScreenTarget): string;
  subscribe(listener: () => void): () => void;
  /** Swap where the address lives, restart the stack from it, and return the undo. */
  install(address: ScreenAddress): () => void;
}

export function createScreenRouter(initial: ScreenAddress = memoryAddress()): ScreenRouter {
  let address = initial;
  let stack: readonly string[] = [address.read()];
  let location = parseScreenHref(stack[0] ?? "/");
  let stopListening = () => undefined as void;
  const listeners = new Set<() => void>();

  const commit = (next: readonly string[]) => {
    stack = next;
    const top = stack[stack.length - 1] ?? "/";
    if (top === location.href) return;
    location = parseScreenHref(top);
    for (const listener of listeners) listener();
  };

  const onAddressChange = () => {
    const href = address.read();
    if (href === location.href) return;
    const root = stack[0] ?? "/";
    commit(
      stack[stack.length - 2] === href
        ? menuStackReducer(stack, { type: "back" }, root)
        : menuStackReducer(stack, { type: "open", id: href }, root),
    );
  };

  return {
    location: () => location,
    stack: () => stack,
    navigate(target) {
      const href = screenHref(target);
      if (href === location.href) return Promise.resolve();
      const mode = target.replace === true ? "replace" : "push";
      address.write(href, mode);
      commit(menuStackReducer(stack, { type: mode === "replace" ? "replace" : "open", id: href }, stack[0] ?? "/"));
      return Promise.resolve();
    },
    linkFor: (target) => address.linkFor(screenHref(target)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    install(next) {
      const previous = address;
      stopListening();
      address = next;
      stopListening = address.listen(onAddressChange);
      commit([address.read()]);
      return () => {
        stopListening();
        stopListening = () => undefined;
        address = previous;
      };
    },
  };
}

/** The one stack LLMville's screens share. */
export const screenRouter = createScreenRouter();

/** Go to a screen. Resolves once the stack has changed, so callers can await it before their next step. */
export function navigate(target: ScreenTarget): Promise<void> {
  return screenRouter.navigate(target);
}

export function useScreenLocation(): ScreenLocation {
  return useSyncExternalStore(screenRouter.subscribe, screenRouter.location, screenRouter.location);
}

/** A link to a screen: a real anchor, so it opens in a new tab, and a plain press changes screens in place. */
export function ScreenLink({
  to,
  params,
  search,
  replace,
  onClick,
  children,
  ...anchor
}: ScreenTarget & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const target: ScreenTarget = { to, params, search, replace };
  return (
    <a
      {...anchor}
      href={screenRouter.linkFor(target)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void navigate(target);
      }}
    >
      {children}
    </a>
  );
}
