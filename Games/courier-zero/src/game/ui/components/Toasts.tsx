import { useRunState } from "../useRunView";

export function Toasts() {
  const run = useRunState();
  if (run.toasts.length === 0) return null;

  const newestFirst = [...run.toasts].reverse();
  return (
    <div className="pointer-events-none flex w-80 flex-col items-center gap-1.5">
      {newestFirst.map((toast, index) => (
        <div
          key={toast.id}
          className="w-full rounded-lg border border-[#e76f51]/50 bg-[#26413c]/95 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[#e8d5a3] shadow-lg"
          style={{ opacity: 1 - index * 0.22 }}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
