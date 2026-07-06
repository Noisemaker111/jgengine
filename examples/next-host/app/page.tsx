import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">JGengine next-host</h1>
      <p className="max-w-md text-center text-sm text-neutral-400">
        Next.js renders the game client and serves plain-fetch reads. The authoritative WebSocket
        host stays a standalone process (see examples/express-host).
      </p>
      <Link href="/play" className="text-emerald-400 underline">
        Play the WoW slice
      </Link>
      <code className="text-xs text-neutral-500">
        GET /api/servers · /api/leaderboard/:stat · /api/leaderboard-profile/:userId ·
        /api/profile/:userId
      </code>
    </main>
  );
}
