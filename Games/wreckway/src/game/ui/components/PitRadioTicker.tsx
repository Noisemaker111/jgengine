import type { RadioLine } from "../../run/session";

export function PitRadioTicker({ ticker }: { ticker: readonly RadioLine[] }) {
  if (ticker.length === 0) return null;
  // ticker is oldest-first (feed order); render newest-first so the most recent line stays on top.
  const newestFirst = [...ticker].reverse();
  return (
    <div className="w-64 rounded border border-[#8d99a6]/40 bg-[#1c1a17]/85 p-2 sm:w-72">
      <p className="text-[10px] font-black tracking-[0.2em] text-[#f0c419]">PIT RADIO</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {newestFirst.map((line, index) => (
          <li
            key={line.id}
            className="truncate text-[11px] font-semibold text-[#e7ddce]"
            style={{ opacity: 1 - index * 0.15 }}
          >
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
