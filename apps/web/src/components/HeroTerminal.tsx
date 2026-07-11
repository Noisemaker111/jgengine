import { useEffect, useState } from "react";

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
  {
    mode: "type",
    prefix: "you",
    prefixClass: "text-cyan-400",
    text: EXAMPLE,
    textClass: "text-slate-100",
    delay: 500,
  },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-violet-400",
    text: "agent reads jgengine · scaffolds · concept pitch",
    textClass: "text-slate-500",
    delay: 700,
  },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-violet-400",
    text: "POV · world · scale — a few questions, then builds",
    textClass: "text-slate-500",
    delay: 750,
  },
  {
    mode: "print",
    prefix: "✓",
    prefixClass: "text-emerald-400",
    text: "full game — not a slice",
    textClass: "text-slate-500",
    delay: 850,
  },
  {
    mode: "print",
    prefix: "▶",
    prefixClass: "text-emerald-300",
    text: "playable",
    textClass: "font-semibold text-emerald-300",
    delay: 650,
  },
];

export function HeroTerminal() {
  const [pos, setPos] = useState({ line: 0, chars: 0 });
  const done = pos.line >= LINES.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPos({ line: LINES.length, chars: 0 });
    }
  }, []);

  useEffect(() => {
    if (done) return;
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
  }, [pos, done]);

  const active = done ? undefined : LINES[pos.line];

  return (
    <div className="panel shine relative overflow-hidden rounded-2xl bg-ink-deep/85 shadow-[0_24px_80px_-24px_rgba(2,3,8,0.95),0_0_60px_-24px_rgba(16,185,129,0.35)] backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        <span className="ml-2 font-mono text-xs text-slate-600">your agent — chat</span>
        <CopyButton value={ENTRY_PROMPT} label="Copy prompt" className="ml-auto" />
      </div>
      <div className="min-h-[15rem] px-5 py-5 text-left font-mono text-[13px] leading-[1.9] sm:text-sm">
        {LINES.slice(0, pos.line).map((line) => (
          <p key={line.text} className="flex gap-2.5">
            <span className={`select-none ${line.prefixClass}`}>{line.prefix}</span>
            <span className={line.textClass}>{line.text}</span>
          </p>
        ))}
        {active !== undefined && active.mode === "type" && (
          <p className="flex gap-2.5">
            <span className={`select-none ${active.prefixClass}`}>{active.prefix}</span>
            <span className={`terminal-caret ${active.textClass}`}>
              {active.text.slice(0, pos.chars)}
            </span>
          </p>
        )}
        {done && <p className="terminal-caret select-none text-cyan-400">you</p>}
      </div>
    </div>
  );
}
