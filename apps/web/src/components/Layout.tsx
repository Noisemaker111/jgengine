import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { ENTRY_PROMPT, REPO_URL } from "../lib/site";
import { ThemeToggle } from "./ThemeToggle";

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** The jgengine mark: four blocks, one of them lit. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2" y="2" width="9" height="9" rx="2" className="fill-fg" />
      <rect x="13" y="2" width="9" height="9" rx="2" className="fill-fg" opacity="0.55" />
      <rect x="2" y="13" width="9" height="9" rx="2" className="fill-fg" opacity="0.55" />
      <rect x="13" y="13" width="9" height="9" rx="2" className="fill-accent" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.15rem] font-bold tracking-tight text-fg">jgengine</span>
    </span>
  );
}

/** Dot-grid backdrop used behind page heroes. */
export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="bg-dots bg-dots-fade absolute inset-0" />
      <div className="absolute -top-40 left-1/2 h-80 w-[46rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  blurb,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  blurb?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={`reveal max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display mt-4 text-balance text-3xl font-bold leading-[1.05] tracking-tight text-fg sm:text-[2.6rem]">
        {title}
      </h2>
      {blurb && <p className="mt-4 text-pretty leading-relaxed text-muted sm:text-lg">{blurb}</p>}
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  blurb: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden">
      <Backdrop />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-24">
        <p className="eyebrow animate-fade-up">{eyebrow}</p>
        <h1
          className="font-display animate-fade-up mt-5 max-w-4xl text-balance text-[2.6rem] font-bold leading-[0.98] tracking-[-0.03em] text-fg sm:text-6xl lg:text-7xl"
          style={{ animationDelay: "60ms" }}
        >
          {title}
        </h1>
        <p
          className="animate-fade-up mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted"
          style={{ animationDelay: "120ms" }}
        >
          {blurb}
        </p>
        {children && (
          <div className="animate-fade-up mt-9" style={{ animationDelay: "180ms" }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { to: "/games", label: "Games" },
  { to: "/capabilities", label: "Capabilities" },
  { to: "/why", label: "Why" },
  { to: "/editor", label: "Editor" },
  { to: "/playground", label: "Playground" },
  { to: "/adopt", label: "Adopt" },
] as const;

export function Header({ sticky = true }: { sticky?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className={`${sticky ? "sticky top-0" : "relative"} z-30 border-b border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-accent"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" onClick={closeMenu} className="shrink-0 rounded-md" aria-label="jgengine home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 text-sm md:flex">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-lg px-3 py-2 text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
              activeProps={{ className: "!text-fg bg-fg/[0.06]", "aria-current": "page" }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <a
            href={REPO_URL}
            aria-label="jgengine on GitHub"
            className="hidden h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg sm:flex"
          >
            <GitHubIcon />
            <span className="hidden lg:inline">GitHub</span>
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-fg transition-colors hover:border-line-strong md:hidden"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-line bg-bg px-3 pb-4 pt-2 md:hidden"
        >
          <ul className="grid gap-0.5">
            {NAV_LINKS.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  onClick={closeMenu}
                  className="font-display flex items-center justify-between rounded-lg px-3 py-3 text-lg font-semibold text-fg transition-colors hover:bg-fg/[0.05]"
                  activeProps={{ className: "!text-accent-text", "aria-current": "page" }}
                >
                  {label}
                  <span aria-hidden className="text-faint">
                    →
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <a
                href={REPO_URL}
                className="font-display flex items-center gap-2 rounded-lg px-3 py-3 text-lg font-semibold text-fg transition-colors hover:bg-fg/[0.05]"
              >
                <GitHubIcon /> GitHub
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
      {open ? (
        <path strokeLinecap="round" d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      ) : (
        <path strokeLinecap="round" d="M2.5 5h11M2.5 11h11" />
      )}
    </svg>
  );
}

const FOOTER_COLUMNS: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: "Site",
    links: [
      { label: "Games", to: "/games" },
      { label: "Capabilities", to: "/capabilities" },
      { label: "Why jgengine", to: "/why" },
      { label: "Editor", to: "/editor" },
      { label: "Playground", to: "/playground" },
      { label: "Adopt one system", to: "/adopt" },
    ],
  },
  {
    title: "For agents",
    links: [
      { label: "llms.txt", href: "/llms.txt" },
      { label: "llms-full.txt", href: "/llms-full.txt" },
      { label: "agents.md", href: "/agents.md" },
      { label: "Skills source", href: `${REPO_URL}/tree/main/.claude/skills` },
    ],
  },
  {
    title: "Source",
    links: [
      { label: "GitHub", href: REPO_URL },
      { label: "Packages", href: `${REPO_URL}/tree/main/packages` },
      { label: "npm: jgengine", href: "https://www.npmjs.com/package/jgengine" },
      { label: "Probe games", href: "https://github.com/Noisemaker111/JGengine-games" },
      { label: "Credits", href: `${REPO_URL}/blob/main/CREDITS.md` },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6">
        <div className="grid gap-12 md:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              A pure-TypeScript game SDK. Coding agents build whole games on it from one sentence.
            </p>
            <p className="mt-5 inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 font-mono text-xs text-muted">
              <span className="text-accent-text" aria-hidden>
                ›
              </span>
              <span className="truncate">{ENTRY_PROMPT}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-faint">{column.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.to !== undefined ? (
                        <Link to={link.to} className="text-muted transition-colors hover:text-fg">
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="text-muted transition-colors hover:text-fg">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            Apache-2.0 ·{" "}
            <a href={REPO_URL} className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg">
              Noisemaker111/jgengine
            </a>
          </p>
          <p>Not related to automotive “JG Engines”.</p>
        </div>
      </div>
      <p
        className="font-display pointer-events-none select-none whitespace-nowrap text-center text-[21vw] font-extrabold leading-[0.72] tracking-[-0.05em] text-fg/[0.04]"
        aria-hidden
      >
        jgengine
      </p>
    </footer>
  );
}

export function Page({ children, stickyHeader = true }: { children: ReactNode; stickyHeader?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header sticky={stickyHeader} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
