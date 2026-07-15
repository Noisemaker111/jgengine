import { useGameStore } from "@jgengine/react/hooks";

import { session, type Tone } from "../../session";

const TONE: Record<Tone, string> = {
  good: "border-emerald-400/50 bg-emerald-500/20 text-emerald-100",
  bad: "border-rose-400/50 bg-rose-500/20 text-rose-100",
  info: "border-sky-400/50 bg-sky-500/20 text-sky-100",
};

export function Toasts() {
  const now = useGameStore((ctx) => Math.floor(ctx.time.now()));
  const toasts = useGameStore(() => session.toasts.map((t) => `${t.id}|${t.tone}|${t.at}|${t.text}`).join("\n"));
  const parsed = toasts.length === 0 ? [] : toasts.split("\n");

  const visible = parsed
    .map((line) => {
      const [id, tone, at, ...rest] = line.split("|");
      return { id: Number(id), tone: tone as Tone, at: Number(at), text: rest.join("|") };
    })
    .filter((t) => now - t.at < 7);

  if (visible.length === 0) return null;

  return (
    <div className="mt-24 flex flex-col items-center gap-1.5">
      {visible.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur ${TONE[t.tone]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
