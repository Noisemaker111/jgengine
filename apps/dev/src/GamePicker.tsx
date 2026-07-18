import { gameRegistry } from "./registries";

const FEATURED_GAMES = ["the-robots", "loopline", "vice-isle", "claudecraft"] as const;

export function GamePicker() {
  const ids = Object.keys(gameRegistry).sort();
  const featured = FEATURED_GAMES.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !FEATURED_GAMES.includes(id as (typeof FEATURED_GAMES)[number]));
  const href = (id: string, mode?: string) => {
    const params = new URLSearchParams({ game: id });
    if (mode !== undefined) params.set("mode", mode);
    return `?${params.toString()}`;
  };
  return (
    <div className="flex h-full flex-col overflow-auto bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold text-cyan-300">JGengine dev runner</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Pick a game. Bare <code className="text-neutral-300">/</code> no longer auto-loads the capsule demo.
        </p>
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Featured</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {featured.map((id) => (
              <div key={id} className="rounded border border-white/10 bg-neutral-900/80 p-3">
                <div className="font-medium text-neutral-100">{id}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className="rounded bg-cyan-700/80 px-2 py-1 text-xs hover:bg-cyan-600" href={href(id)}>
                    Play
                  </a>
                  <a
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                    href={href(id, "editor")}
                  >
                    Editor
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">All games</div>
          <div className="flex flex-wrap gap-1.5">
            {rest.map((id) => (
              <a
                key={id}
                className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-neutral-300 hover:border-cyan-700/50 hover:text-cyan-200"
                href={href(id)}
              >
                {id}
              </a>
            ))}
          </div>
        </div>
        <div className="mt-8">
          <a
            className="inline-flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
            href="?editor=standalone"
          >
            🧊 Open the standalone scene editor
          </a>
        </div>
        <p className="mt-6 text-[11px] text-neutral-500">
          Direct URLs: <code className="text-neutral-400">?game=the-robots</code> ·{" "}
          <code className="text-neutral-400">?game=the-robots&amp;mode=editor</code> ·{" "}
          <code className="text-neutral-400">?editor=standalone</code>
        </p>
      </div>
    </div>
  );
}
