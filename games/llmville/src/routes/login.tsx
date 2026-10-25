import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { useAuth } from "@/auth";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import { destinationAfterAuth, parsePlayEntryIntent, type PlayEntryIntent } from "@/runtime/playEntry";
import { loadAuthScreenModule } from "@/user/authScreenPreload";

const LoginScreen = lazy(async () =>
  loadAuthScreenModule().then((module) => ({ default: module.LoginScreen })),
);

interface LoginSearch {
  intent?: PlayEntryIntent;
}

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>): LoginSearch => ({
    intent: parsePlayEntryIntent(raw["intent"]),
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = Route.useNavigate();
  const { intent } = Route.useSearch();
  const { isAuthenticated, isAnonymous } = useAuth();
  const isSignedInAccount = isAuthenticated && !isAnonymous;

  useEffect(() => {
    if (isSignedInAccount) {
      void navigate({ ...destinationAfterAuth(intent), replace: true });
    }
  }, [intent, isSignedInAccount, navigate]);

  if (isSignedInAccount) {
    return <RouteLoadingScreen label="Checking session" />;
  }

  return (
    <Suspense fallback={<RouteLoadingScreen label="Loading login" />}>
      <LoginScreen playIntent={intent} />
    </Suspense>
  );
}
