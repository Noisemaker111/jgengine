/** User-facing copy when a lazy-loaded route chunk fails to download or execute. */
export function formatChunkLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /importing a module script failed/i.test(message)
    || /failed to fetch dynamically imported module/i.test(message)
    || /loading chunk [\w-]+ failed/i.test(message)
    || /error loading dynamically imported module/i.test(message)
  ) {
    return "The game code failed to load — usually after a site update. Hard-refresh the page (Ctrl+Shift+R or Cmd+Shift+R) and try again.";
  }
  return message;
}
