/** @jsxImportSource @jgengine/core/ui/jsx */
import { navigate } from "./screenRouter";
import type { ScreenProps } from "./screens";
import { useEffect } from "@jgengine/core/ui/jsx";
import { useAuth } from "../auth";
import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import { destinationAfterAuth, parsePlayEntryIntent, type PlayEntryIntent } from "../runtime/playEntry";
import { LoginScreen, SignupScreen } from "../user/components/AuthScreen";

/** Sends an already signed-in account on to where it was headed; everyone else gets the form. */
function useSignedInRedirect(intent: PlayEntryIntent | undefined): boolean {
  const { isAuthenticated, isAnonymous } = useAuth();
  const isSignedInAccount = isAuthenticated && !isAnonymous;

  useEffect(() => {
    if (isSignedInAccount) {
      void navigate({ ...destinationAfterAuth(intent), replace: true });
    }
  }, [intent, isSignedInAccount]);

  return isSignedInAccount;
}

export function LoginEntryScreen({ search }: ScreenProps) {
  const intent = parsePlayEntryIntent(search["intent"]);
  if (useSignedInRedirect(intent)) return <RouteLoadingScreen label="Checking session" />;
  return <LoginScreen playIntent={intent} />;
}

export function SignupEntryScreen({ search }: ScreenProps) {
  const intent = parsePlayEntryIntent(search["intent"]);
  if (useSignedInRedirect(intent)) return <RouteLoadingScreen label="Checking session" />;
  return <SignupScreen playIntent={intent} />;
}
