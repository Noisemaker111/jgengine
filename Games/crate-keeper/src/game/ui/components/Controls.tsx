import type { Dir } from "../../sokoban";

type ControlsProps = {
  readonly coarse: boolean;
  readonly canUndo: boolean;
  readonly onMove: (dir: Dir) => void;
  readonly onUndo: () => void;
  readonly onRestart: () => void;
};

function DirButton({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex h-14 w-14 select-none items-center justify-center rounded-xl bg-gradient-to-b from-amber-700/80 to-amber-900/80 text-2xl font-black text-amber-50 shadow-lg ring-1 ring-amber-950/60 transition active:scale-90 active:from-amber-600/90"
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

function ActionButton({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className="rounded-xl bg-black/30 px-4 py-3 text-sm font-bold text-amber-100/90 ring-1 ring-amber-900/40 transition enabled:hover:bg-black/45 enabled:active:scale-95 disabled:opacity-35"
    >
      {label}
    </button>
  );
}

export function Controls({ coarse, canUndo, onMove, onUndo, onRestart }: ControlsProps) {
  if (!coarse) {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <ActionButton label="Undo (Z)" disabled={!canUndo} onPress={onUndo} />
          <ActionButton label="Restart (R)" onPress={onRestart} />
        </div>
        <p className="text-xs text-amber-200/40">Arrows / WASD to push · Z undo · R restart · Esc for levels</p>
      </div>
    );
  }
  return (
    <div className="flex w-full items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <ActionButton label="Undo" disabled={!canUndo} onPress={onUndo} />
        <ActionButton label="Restart" onPress={onRestart} />
      </div>
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5" style={{ width: 172 }}>
        <div />
        <DirButton label="Up" glyph="▲" onPress={() => onMove("U")} />
        <div />
        <DirButton label="Left" glyph="◀" onPress={() => onMove("L")} />
        <div />
        <DirButton label="Right" glyph="▶" onPress={() => onMove("R")} />
        <div />
        <DirButton label="Down" glyph="▼" onPress={() => onMove("D")} />
        <div />
      </div>
    </div>
  );
}
