import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { settings: true, tab: "general" } });
  },
  component: () => null,
});
