import type { ReactNode } from "react";

import { CopyButton } from "./Copy";

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "function",
  "return",
  "if",
  "for",
  "of",
  "await",
  "async",
  "new",
  "type",
  "interface",
  "continue",
  "npx",
  "bun",
]);

const TOKEN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\/\/.*$|#.*$|[A-Za-z_$][\w$]*)/g;

/** A light, dependency-free highlighter: comments, strings and a handful of keywords. */
function CodeLine({ line }: { line: string }) {
  if (line.length === 0) return <>{"​"}</>;
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const text = match[0];
    const at = match.index ?? 0;
    if (text.startsWith("#") && line.slice(0, at).trim().length > 0) continue;
    if (at > last) out.push(line.slice(last, at));
    if (text.startsWith("//") || text.startsWith("#")) {
      out.push(
        <span key={at} className="tok-comment">
          {text}
        </span>,
      );
      last = line.length;
      break;
    }
    if (/^["'`]/.test(text)) {
      out.push(
        <span key={at} className="tok-string">
          {text}
        </span>,
      );
    } else if (KEYWORDS.has(text)) {
      out.push(
        <span key={at} className="tok-keyword">
          {text}
        </span>,
      );
    } else {
      out.push(text);
    }
    last = at + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return <>{out}</>;
}

/** A titled, copyable code panel: the "show the real thing" surface across the site. */
export function CodeBlock({
  code,
  filename,
  tone = "neutral",
  copy = true,
  className = "",
}: {
  code: string;
  filename?: string;
  tone?: "neutral" | "good" | "bad";
  copy?: boolean;
  className?: string;
}) {
  const border = tone === "good" ? "border-accent/40" : tone === "bad" ? "border-line" : "border-line";
  return (
    <div className={`code-surface overflow-hidden rounded-2xl border ${border} ${className}`}>
      {(filename !== undefined || copy) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-faint">
            <span
              className={`h-2 w-2 shrink-0 rounded-[2px] ${tone === "good" ? "bg-accent" : tone === "bad" ? "bg-faint/60" : "bg-fg/30"}`}
              aria-hidden
            />
            <span className="truncate">{filename}</span>
          </span>
          {copy && <CopyButton value={code} variant="ghost" />}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-[1.7] sm:text-[13px]">
        <code className="font-mono">
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

/** Side-by-side "do it yourself vs. do it with jgengine". */
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
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-faint">{beforeLabel}</span>
          {beforeNote && <span className="text-xs text-faint">{beforeNote}</span>}
        </div>
        <CodeBlock code={before} tone="bad" copy={false} className="max-h-[34rem] overflow-y-auto" />
      </div>
      <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-text">{afterLabel}</span>
          {afterNote && <span className="text-xs text-muted">{afterNote}</span>}
        </div>
        <CodeBlock code={after} tone="good" copy={false} />
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden>
      <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dash() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden>
      <path d="M4 8h8" strokeLinecap="round" />
    </svg>
  );
}

/** Two-column strengths / trade-offs. */
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
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-6 sm:p-7">
        <p className="eyebrow">{prosTitle}</p>
        <ul className="mt-6 space-y-5">
          {pros.map((item) => (
            <li key={item.title} className="flex gap-3">
              <Check />
              <div>
                <p className="font-semibold text-fg">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-dashed border-line-strong p-6 sm:p-7">
        <p className="font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] text-faint">{consTitle}</p>
        <ul className="mt-6 space-y-5">
          {cons.map((item) => (
            <li key={item.title} className="flex gap-3">
              <Dash />
              <div>
                <p className="font-semibold text-fg">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A compact feature tile with a glyph, used in grids on the editor and adopt pages. */
export function FeatureCard({ glyph, title, children }: { glyph: string; title: string; children: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-bg text-lg" aria-hidden>
        {glyph}
      </div>
      <h3 className="font-display mt-4 text-lg font-semibold tracking-tight text-fg">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
