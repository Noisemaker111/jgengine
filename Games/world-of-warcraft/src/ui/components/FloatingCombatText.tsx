import { useEffect, useState } from "react";

export function FloatingCombatText({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(message);

  useEffect(() => {
    if (message === null) return;
    setVisible(message);
    const timer = window.setTimeout(() => setVisible(null), 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (visible === null) return null;

  return (
    <p className="pointer-events-none animate-pulse text-center text-lg font-bold uppercase tracking-wide text-amber-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
      {visible}
    </p>
  );
}