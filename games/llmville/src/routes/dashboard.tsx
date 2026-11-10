import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "@jgengine/core/ui/jsx";

const DashboardScreen = lazy(async () => import("../runtime/components/DashboardScreen").then((module) => ({ default: module.DashboardScreen })));

export const Route = createFileRoute("/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <Suspense fallback={null}>
      <DashboardScreen />
    </Suspense>
  );
}
