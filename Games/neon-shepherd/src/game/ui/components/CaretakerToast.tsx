import type { ToastEntry } from "../../session/store";

export function CaretakerToast({ toasts }: { toasts: readonly ToastEntry[] }): React.ReactNode {
  const visible = toasts.slice(-3);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      {visible.map((toast, index) => (
        <span
          key={toast.id}
          className="text-sm italic text-[#eef4f0] drop-shadow-[0_0_6px_rgba(126,249,200,0.6)] animate-[caretaker-fade_4s_ease-out_forwards]"
          style={{ opacity: 0.4 + (index / visible.length) * 0.6 }}
        >
          {toast.text}
        </span>
      ))}
    </div>
  );
}
