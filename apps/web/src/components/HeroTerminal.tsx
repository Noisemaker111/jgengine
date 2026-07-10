import { useEffect, useState } from "react";

import { INSTALL_CMD } from "../lib/site";
import { CopyButton } from "./Copy";

const PROMPT = "build me a first-person voxel mining game";

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
    prefix: "$",
    prefixClass: "text-emerald-500/80",
    text: INSTALL_CMD,
    textClass: "text-slate-200",
    delay: 500,
  },
  {
    mode: "print",
    prefix: "✓",
    prefixClass: "text-emerald-400",
    text: "3 skills installed — newgame · api · verify",
    textClass: "text-slate-500",
    delay: 550,
  },
  {
    mode: "type",
    prefix: "›",
    prefixClass: "text-cyan-400",
    text: PROMPT,
    textClass: "text-slate-100",
    delay: 800,
  },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-violet-400",
    text: "jgengine-newgame → blueprint: world, verbs, HUD, content budget",
    textClass: "text-slate-500",
    delay: 950,
  },
  {
    mode: "print",
    prefix: "◆",
    prefixClass: "text-violet-400",
    text: "terrain · mining · hotbar · saves — wired to @jgengine/core",
    textClass: "text-slate-500",
    delay: 750,
  },
  {
    mode: "print",
    prefix: "✓",
    prefixClass: "text-emerald-400",
    text: "jgengine-verify — scene assertions pass",
    textClass: "text-slate-500",
    delay: 850,
  },
  {
    mode: "print",
    prefix: "▶",
    prefixClass: "text-emerald-300",
    text: "playable at /games/voxel-mine",
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
        <span className="ml-2 font-mono text-xs text-slate-600">your-agent — session</span>
        <CopyButton value={PROMPT} label="Copy prompt" className="ml-auto" />
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
        {done && <p className="terminal-caret select-none text-emerald-500/80">$</p>}
      </div>
    </div>
  );
}
