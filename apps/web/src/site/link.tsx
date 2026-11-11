/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, type ReactNode } from "@jgengine/core/ui/jsx";
import type { AnchorHTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";

import { fillPath, normalizePath, type Params } from "./routes";

export interface SiteLocation {
  pathname: string;
  params: Params;
}

/** The page being drawn: its path and `$` parameters. */
export const LocationContext = createContext<SiteLocation>({ pathname: "/", params: {} });

/** The current page's `$` parameters, such as `{ id }` on `/games/$id`. */
export function useParams<T extends Params = Params>(): T {
  return useContext(LocationContext).params as T;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  params?: Params;
  hash?: string;
  /** Added when the link points at the current page or one under it (`/` only when exact). */
  activeProps?: { className?: string; "aria-current"?: "page" };
  children?: ReactNode;
};

/** A link to a site page: a plain `<a>`, so every visit is a full page load of a prerendered page. */
export function Link({ to, params, hash, activeProps, className, children, ...rest }: LinkProps) {
  const { pathname } = useContext(LocationContext);
  const path = fillPath(to, params);
  const here = normalizePath(pathname);
  const active = activeProps !== undefined && (path === "/" ? here === "/" : here === path || here.startsWith(`${path}/`));
  const classes = [className, active ? activeProps.className : undefined].filter(Boolean).join(" ");
  return (
    <a
      {...rest}
      href={hash === undefined ? path : `${path}#${hash}`}
      {...(classes === "" ? {} : { className: classes })}
      {...(active && activeProps["aria-current"] !== undefined ? { "aria-current": activeProps["aria-current"] } : {})}
    >
      {children}
    </a>
  );
}
