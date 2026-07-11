import * as T from "../theme";

export function NumberPad({
  counts,
  notesMode,
  size,
  onDigit,
}: {
  counts: number[];
  notesMode: boolean;
  size: number;
  onDigit: (digit: number) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-1" style={{ width: size * 9 }}>
      {Array.from({ length: 9 }, (_, k) => {
        const d = k + 1;
        const remaining = 9 - counts[d];
        const done = remaining <= 0;
        return (
          <button
            key={d}
            type="button"
            disabled={done}
            onClick={() => onDigit(d)}
            className="flex flex-col items-center justify-center rounded-md border py-1.5 transition-colors disabled:opacity-30"
            style={{
              borderColor: T.THIN_LINE,
              background: notesMode ? T.INDIGO_SOFT : "#fbf8f0",
              color: notesMode ? T.NOTE : T.INDIGO,
              touchAction: "manipulation",
            }}
          >
            <span className="font-bold leading-none" style={{ fontSize: Math.round(size * 0.5) }}>
              {d}
            </span>
            <span className="mt-0.5 text-[9px] font-medium leading-none" style={{ color: T.NOTE }}>
              {remaining}
            </span>
          </button>
        );
      })}
    </div>
  );
}
