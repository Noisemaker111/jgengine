import type { ReactNode } from "react";

import { CODE_LENGTH, type Round } from "../../codebreaker";
import { PEGS, pegStyle } from "../theme";
import { Btn, KeyHint, Toggle } from "./widgets";

function Palette({ round, run, size }: { round: Round; run: (name: string) => void; size: number }): ReactNode {
  const disabled = round.status !== "playing";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {PEGS.slice(0, round.colors).map((def, i) => (
        <button
          key={i}
          type="button"
          onClick={() => run(`color${i + 1}`)}
          disabled={disabled}
          className="relative inline-flex items-center justify-center font-extrabold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            ...pegStyle(def.color),
            width: size + 10,
            height: size + 10,
            borderRadius: "50%",
            fontSize: Math.round((size + 10) * 0.5),
            color: "rgba(18,9,0,0.72)",
            textShadow: "0 1px 0 rgba(255,255,255,0.4)",
          }}
          title={`${def.name} — key ${i + 1}`}
          aria-label={`Place ${def.name}, key ${i + 1}`}
        >
          {def.glyph}
          <span className="absolute -right-1.5 -bottom-1.5 rounded bg-black/70 px-1 text-[9px] font-bold text-amber-100">
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Controls({
  round,
  run,
  onCopy,
  copied,
  pegSize,
}: {
  round: Round;
  run: (name: string) => void;
  onCopy: () => void;
  copied: boolean;
  pegSize: number;
}): ReactNode {
  const full = round.active.length === CODE_LENGTH;
  const playing = round.status === "playing";
  return (
    <div className="flex flex-col items-center gap-2.5">
      <Palette round={round} run={run} size={pegSize} />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Btn onClick={() => run("submitGuess")} disabled={!full || !playing} primary>
          Submit
          <KeyHint action="submitGuess" />
        </Btn>
        <Btn onClick={() => run("deletePeg")} disabled={round.active.length === 0}>
          Delete
          <KeyHint action="deletePeg" />
        </Btn>
        <Btn onClick={() => run("clearRow")} disabled={round.active.length === 0}>
          Clear
          <KeyHint action="clearRow" />
        </Btn>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Btn onClick={() => run("newGame")}>
          New
          <KeyHint action="newGame" />
        </Btn>
        <Btn onClick={() => run("daily")} active={round.kind === "daily"}>
          Daily
          <KeyHint action="daily" />
        </Btn>
        <Toggle on={round.options.duplicates} onClick={() => run("toggleDuplicates")}>
          Duplicates
        </Toggle>
        <Toggle on={round.options.hard} onClick={() => run("toggleHard")}>
          8 colors
        </Toggle>
        <Btn onClick={onCopy}>{copied ? "Copied!" : "Share"}</Btn>
      </div>
    </div>
  );
}
