import { Suspense, lazy } from "react";

import { ClientOnly, createFileRoute } from "@tanstack/react-router";

const GameClient = lazy(() => import("../components/GameClient"));

export const Route = createFileRoute("/play")({
  ssr: false,
  component: PlayPage,
});

function PlayPage() {
  return (
    <div style={{ height: "100vh" }}>
      <ClientOnly fallback={<div style={{ height: "100%", background: "#0a0a0a" }} />}>
        <Suspense fallback={<div style={{ height: "100%", background: "#0a0a0a" }} />}>
          <GameClient />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
