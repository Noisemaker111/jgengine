import { useEffect, useRef, useState } from "react";

import { ENTRY_PROMPT } from "../lib/site";
import { CopyButton } from "./Copy";

const EXAMPLE =
  "Make a game that is Mario Party with gooey slime characters, with jgengine";

type TermLine = {
  mode: "type" | "print";
  prefix: string;
  prefixClass: string;
  text: string;
  textClass: string;
  delay: number;
};

const LINES: TermLine[] = [
  { mode: "type", prefix: "you", prefixClass: "text-accent-text", text: EXAMPLE, textClass: "text-fg", delay: 500 },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-faint",
    text: 'npx jgengine create "Goo Party"  → project + skills',
    textClass: "text-muted",
    delay: 700,
  },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-faint",
    text: "jgengine intake → world · gameplay · ui · multiplayer",
    textClass: "text-muted",
    delay: 900,
  },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-faint",
    text: "composes primitives from each capabilities.md",
    textClass: "text-muted",
    delay: 800,
  },
  {
    mode: "print",
    prefix: "✓",
    prefixClass: "text-live",
    text: "bun run check-types · bun test · bun run shoot",
    textClass: "text-muted",
    delay: 850,
  },
  { mode: "print", prefix: "▶", prefixClass: "text-accent-text", text: "playable", textClass: "font-semibold text-fg", delay: 650 },
];

export function HeroTerminal() {
  const [pos, setPos] = useState({ line: 0, chars: 0 });
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const done = pos.line >= LINES.length;

  useEffect(() => {
    const el = rootRef.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPos({ line: LINES.length, chars: 0 });
    }
  }, []);

  useEffect(() => {
    if (done || !started) return;
    const current = LINES[pos.line];
    if (current === undefined) return;
    const stillTyping = current.mode === "type" && pos.chars < current.text.length;
    const wait = stillTyping
      ? pos.chars === 0
        ? current.delay
        : 14 + Math.random() * 26
      : current.mode === "print"
        ? current.delay
        : 380;
    const timer = window.setTimeout(() => {
      setPos((p) =>
        stillTyping ? { line: p.line, chars: p.chars + 1 } : { line: p.line + 1, chars: 0 },
      );
    }, wait);
    return () => window.clearTimeout(timer);
  }, [pos, done, started]);

  const active = done ? undefined : LINES[pos.line];

  return (
    <div ref={rootRef} className="code-surface relative overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
        <span className="ml-2 font-mono text-xs text-faint">your agent</span>
        <CopyButton value={ENTRY_PROMPT} label="Copy prompt" variant="ghost" className="ml-auto" />
      </div>
      <div className="min-h-[16rem] px-4 py-5 text-left font-mono text-[12.5px] leading-[1.9] sm:px-5 sm:text-[13px]" aria-live="off">
        {LINES.slice(0, pos.line).map((line) => (
          <p key={line.text} className="flex gap-2.5">
            <span className={`w-6 shrink-0 select-none ${line.prefixClass}`}>{line.prefix}</span>
            <span className={`min-w-0 break-words ${line.textClass}`}>{line.text}</span>
          </p>
        ))}
        {active !== undefined && active.mode === "type" && (
          <p className="flex gap-2.5">
            <span className={`w-6 shrink-0 select-none ${active.prefixClass}`}>{active.prefix}</span>
            <span className={`terminal-caret min-w-0 break-words ${active.textClass}`}>{active.text.slice(0, pos.chars)}</span>
          </p>
        )}
        {done && <p className="terminal-caret w-6 select-none text-accent-text">you</p>}
      </div>
    </div>
  );
}
