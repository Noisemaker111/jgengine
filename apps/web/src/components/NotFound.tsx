import { Link } from "@tanstack/react-router";

import { Backdrop, Page } from "./Layout";

export function NotFound() {
  return (
    <Page>
      <section className="relative overflow-hidden">
        <Backdrop />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-36">
          <p className="eyebrow">404 · not found</p>
          <h1 className="font-display mt-5 text-balance text-5xl font-bold leading-none tracking-[-0.03em] text-fg sm:text-7xl">
            No page here.
          </h1>
          <p className="mt-6 max-w-md text-pretty text-lg text-muted">
            The link may be old, or the page moved. Games, capabilities and the playground are one click away.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/" className="btn btn-primary">
              Home <span className="arrow" aria-hidden>→</span>
            </Link>
            <Link to="/games" className="btn btn-secondary">
              Play the games
            </Link>
          </div>
        </div>
      </section>
    </Page>
  );
}
