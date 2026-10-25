import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/game/select-founder")({
  beforeLoad: () => {
    throw redirect({ to: "/game/create", replace: true });
  },
});