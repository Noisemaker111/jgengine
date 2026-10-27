/** The build-time switches this game reads; Vite fills them from the environment. */
interface ImportMetaEnv {
  /** "1" in a dev build makes the park post its evidence trace to the dev server. */
  readonly VITE_PARK_EVIDENCE?: string;
}
