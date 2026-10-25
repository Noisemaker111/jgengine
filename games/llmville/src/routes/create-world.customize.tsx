import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/create-world/customize")({
  beforeLoad: () => {
    throw redirect({ to: "/game/create", replace: true });
  },
});