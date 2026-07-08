import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", fontFamily: "sans-serif" }}>
      <h1>JGengine tanstack-host</h1>
      <p style={{ maxWidth: "32rem", textAlign: "center", color: "#888" }}>
        TanStack Start renders the game client and serves plain-fetch reads. The authoritative
        WebSocket host stays a standalone process (see examples/express-host).
      </p>
      <Link to="/play">Play the game</Link>
      <code style={{ fontSize: "0.75rem", color: "#666" }}>
        GET /api/servers · /api/leaderboard/:stat · /api/leaderboard-profile/:userId ·
        /api/profile/:userId
      </code>
    </main>
  );
}
