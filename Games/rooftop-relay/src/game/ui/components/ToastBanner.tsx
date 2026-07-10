import type { Toast } from "../../relay/state";

export function ToastBanner({ toast }: { toast: Toast | null }) {
  if (toast === null) return null;
  return (
    <p
      key={toast.id}
      className="animate-fade-out text-sm font-semibold text-[#f2b950] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
    >
      {toast.text}
    </p>
  );
}
