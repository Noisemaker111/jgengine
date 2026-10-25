import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { useAuth } from "@/auth";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import { destinationAfterAuth, parsePlayEntryIntent, type PlayEntryIntent } from "@/runtime/playEntry";
import { loadAuthScreenModule } from "@/user/authScreenPreload";

const SignupScreen = lazy(async () =>
  loadAuthScreenModule().then((module) => ({ default: module.SignupScreen })),
);

interface SignupSearch {
  intent?: PlayEntryIntent;
}

export const Route = createFileRoute("/signup")({
  validateSearch: (raw: Record<string, unknown>): SignupSearch => ({
    intent: parsePlayEntryIntent(raw["intent"]),
  }),
  component: SignupRoute,
});

function SignupRoute() {
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
    <Suspense fallback={<RouteLoadingScreen label="Loading signup" />}>
      <SignupScreen playIntent={intent} />
    </Suspense>
  );
}
