import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { demoPart, type DemoKey } from "./demoParts";
import { TracedDemo } from "./TracedDemo";

/** Several live demos behind tabs, one running at a time, each above the code that drives it. */
export function EngineTour({
  demos,
  eyebrow,
  title,
  lede,
}: {
  demos: readonly DemoKey[];
  eyebrow: string;
  title: string;
  lede: ReactNode;
}) {
  const [active, setActive] = useState<DemoKey>(demos[0]!);
  const part = demoPart(active);
  return (
    <section className="band" aria-label={title}>
      <div className="band-inner">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="band-title">{title}</h2>
        <p className="band-lede mt-3">{lede}</p>
        <div role="tablist" aria-label="Live demos" className="mt-6 flex flex-wrap gap-2">
          {demos.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === active}
              onClick={() => setActive(key)}
              className={`rounded-full border px-4 py-1.5 font-mono text-[13px] transition-colors ${
                key === active ? "border-accent bg-accent/10 text-accent-text" : "border-line text-muted hover:text-fg"
              }`}
            >
              {demoPart(key).label}
            </button>
          ))}
        </div>
        <p className="mt-4 mb-4 text-sm text-muted">
          {part.does}
          {part.why !== undefined && (
            <>
              {" "}
              <Link to="/why" hash={part.why} className="link">
                Compare it with the code by hand
              </Link>
            </>
          )}
        </p>
        <TracedDemo key={active} demo={active} />
      </div>
    </section>
  );
}
