import type { ReactNode } from "react";

import { CopyButton } from "./Copy";

function WindowDots() {
  return (
    <span className="flex gap-1.5" aria-hidden>
      <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
      <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
      <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
    </span>
  );
}

/** Renders one line of code with dimmed comments and highlighted string literals — a light, dependency-free token pass. */
function CodeLine({ line }: { line: string }) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return <span className="text-slate-500">{line || "​"}</span>;
  }
  const parts = line.split(/("[^"]*"|`[^`]*`|'[^']*')/g);
  return (
    <>
      {parts.map((part, i) =>
        /^["'`]/.test(part) ? (
          <span key={i} className="text-emerald-300/85">
            {part}
          </span>
        ) : (
          <span key={i}>{part || "​"}</span>
        ),
      )}
    </>
  );
}

/** A titled, copyable code panel — the primary "show the real thing" surface across the marketing pages. */
export function CodeBlock({
  code,
  filename,
  tone = "neutral",
  copy = true,
}: {
  code: string;
  filename?: string;
  tone?: "neutral" | "good" | "bad";
  copy?: boolean;
}) {
  const border =
    tone === "good"
      ? "border-emerald-400/25"
      : tone === "bad"
        ? "border-rose-400/20"
        : "border-white/[0.08]";
  const label =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-rose-300/90"
        : "text-slate-400";
  return (
    <div className={`overflow-hidden rounded-2xl border ${border} bg-ink-deep/85 shadow-[0_8px_32px_-16px_rgba(2,3,8,0.9)]`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <WindowDots />
          {filename && <span className={`font-mono text-[11px] ${label}`}>{filename}</span>}
        </div>
        {copy && <CopyButton value={code} className="border-0 bg-transparent px-1.5 py-1 hover:bg-white/10" />}
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed sm:text-[13px]">
        <code className="font-mono text-slate-300">
          {code.split("\n").map((line, i) => (
            <div key={i}>
              <CodeLine line={line} />
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

/** Side-by-side "do it yourself vs. do it with jgengine" — the core comparison the pages lean on. */
export function VersusBlock({
  before,
  after,
  beforeLabel = "Hand-rolled",
  afterLabel = "With jgengine",
  beforeNote,
  afterNote,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeNote?: string;
  afterNote?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-rose-300/80">{beforeLabel}</span>
          {beforeNote && <span className="text-xs text-slate-500">{beforeNote}</span>}
        </div>
        <CodeBlock code={before} tone="bad" copy={false} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-300/90">{afterLabel}</span>
          {afterNote && <span className="text-xs text-emerald-400/70">{afterNote}</span>}
        </div>
        <CodeBlock code={after} tone="good" copy={false} />
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
      <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dot() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.5 8h5" strokeLinecap="round" />
    </svg>
  );
}

/** Honest two-column strengths / trade-offs — trust-building, not a feature dump. */
export function ProsCons({
  pros,
  cons,
  prosTitle = "Where it shines",
  consTitle = "Where it won't",
}: {
  pros: { title: string; body: string }[];
  cons: { title: string; body: string }[];
  prosTitle?: string;
  consTitle?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel rounded-2xl border-emerald-400/20 bg-emerald-400/[0.03] p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-300/90">{prosTitle}</p>
        <ul className="mt-5 space-y-4">
          {pros.map((item) => (
            <li key={item.title} className="flex gap-3">
              <Check />
              <div>
                <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel rounded-2xl p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">{consTitle}</p>
        <ul className="mt-5 space-y-4">
          {cons.map((item) => (
            <li key={item.title} className="flex gap-3">
              <Dot />
              <div>
                <p className="text-sm font-semibold text-slate-200">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A compact feature tile with an emoji glyph, used in grids on the editor and capabilities pages. */
export function FeatureCard({ glyph, title, children }: { glyph: string; title: string; children: ReactNode }) {
  return (
    <div className="card-hover panel rounded-2xl p-5">
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-lg">
        {glyph}
      </div>
      <h3 className="mt-3.5 font-semibold tracking-tight text-slate-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}
