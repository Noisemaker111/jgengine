"use client";

import dynamic from "next/dynamic";

const GameClient = dynamic(() => import("../../components/GameClient"), { ssr: false });

export default function PlayPage() {
  return (
    <div style={{ height: "100vh" }}>
      <GameClient />
    </div>
  );
}
