/** @jsxImportSource @jgengine/core/ui/jsx */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/game")({
  component: Outlet,
});
