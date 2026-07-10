import { useRunState } from "../hooks";

export function RadioTicker() {
  const run = useRunState();
  const entries = run.log.slice(-5).reverse();

  return (
    <div className="flex w-64 flex-col gap-1.5 rounded-lg border border-[#3d4a5c] bg-[#1e2633]/85 p-3 shadow-lg">
      <div className="text-[10px] uppercase tracking-widest text-[#9fb8c8]">Dispatch — CB 9</div>
      <div className="flex flex-col gap-1.5">
        {entries.length === 0 ? (
          <p className="text-xs italic text-[#9fb8c8]/70">Channel quiet...</p>
        ) : (
          entries.map((entry, i) => (
            <p key={entry.id} className={i === 0 ? "text-xs font-medium text-[#f25c05]" : "text-xs text-[#d9a441]/75"}>
              {entry.text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
