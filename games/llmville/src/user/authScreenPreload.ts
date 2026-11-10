// Signed-out entry points warm this chunk ahead of the /login navigation so the
// sign-in form never queues behind the game-session download. The routes' lazy()
// resolve from the same promise instead of re-fetching.
let authScreenModulePromise: Promise<typeof import("./components/AuthScreen")> | null = null;

export function loadAuthScreenModule() {
  authScreenModulePromise ??= import("./components/AuthScreen");
  return authScreenModulePromise;
}
