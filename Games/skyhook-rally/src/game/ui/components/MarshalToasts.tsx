import type { Toast } from "../../session/sessionState";

export function MarshalToasts({ toasts }: { toasts: readonly Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1.5">
      {toasts.map((toast, i) => (
        <p
          key={toast.id}
          className="rounded-full bg-[#2b2118]/80 px-4 py-1.5 text-xs font-semibold text-[#f4efe6] shadow-md"
          style={{ opacity: 0.5 + (0.5 * (i + 1)) / toasts.length }}
        >
          {toast.text}
        </p>
      ))}
    </div>
  );
}
