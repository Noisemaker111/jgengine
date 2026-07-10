import { ROADS } from "../../roads/catalog";

export function LoseScreen({
  saved,
  roadIndex,
  onRestart,
}: {
  saved: number;
  roadIndex: number | null;
  onRestart: () => void;
}): React.ReactNode {
  const road = roadIndex !== null ? ROADS[roadIndex] : undefined;
  return (
    <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-5 bg-[#101318]/92 text-center backdrop-blur-md">
      <span className="text-xs uppercase tracking-widest text-[#f9a8d4]">The herd broke</span>
      <h1 className="text-4xl font-semibold text-[#eef4f0]">Only {saved} lights are left</h1>
      <span className="text-sm text-[#eef4f0]/70">
        {road !== undefined ? `The city took too many at ${road.label}.` : "The city took too many along the way."}
      </span>
      <button
        type="button"
        onClick={onRestart}
        className="rounded-full bg-[#f9a8d4] px-8 py-3 text-sm font-semibold uppercase tracking-widest text-[#101318] shadow-[0_0_20px_rgba(249,168,212,0.5)] transition-transform hover:scale-105"
      >
        Try again · R
      </button>
    </div>
  );
}
