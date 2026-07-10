import { RUNNERS } from "../../runners/catalog";

export function CrewRoster() {
  return (
    <ul className="flex flex-col gap-2">
      {RUNNERS.map((runner, index) => (
        <li key={runner.id} className="flex items-center gap-3 rounded-md bg-black/30 px-3 py-2">
          <span
            className="h-8 w-8 shrink-0 rounded-full border-2 border-white/40"
            style={{ backgroundColor: runner.jersey }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#f2b950]">
              Leg {index + 1} — {runner.name}
            </p>
            <p className="truncate text-xs text-[#c9c4b8]">{runner.flavor}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
