import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { Header } from "../components/Layout";
import { GAMES } from "../content/games";

export const Route = createFileRoute("/games/$gameId")({
  loader: ({ params }) => {
    const game = GAMES.find((entry) => entry.id === params.gameId);
    if (game === undefined) throw notFound();
    return { game };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.game.title ?? "Play"} — JGengine` },
      { name: "description", content: loaderData?.game.tagline ?? "Play a JGengine game in the browser." },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { game } = Route.useLoaderData();
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100">{game.title}</h1>
          <p className="hidden truncate font-mono text-xs text-slate-500 sm:block">{game.controls}</p>
        </div>
        <Link
          to="/games"
          className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:text-emerald-300"
        >
          ← All games
        </Link>
      </div>
      <main className="min-h-0 flex-1 bg-black">
        <iframe
          src={`/play/?game=${encodeURIComponent(game.id)}`}
          title={game.title}
          allow="fullscreen; gamepad; pointer-lock"
          className="h-full w-full border-0"
        />
      </main>
    </div>
  );
}
