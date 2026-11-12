/**
 * Install the game's own file list, then evaluate the game module. A game resolves some asset URLs
 * while its modules evaluate (every game registers its Rune fonts at import), and a URL resolved
 * before the list is in place points at the runner's shared folder: on jgengine.com that was
 * `/play/fonts/<id>.woff2`, a 404 per font, where the file is served at `/play/games/<game>/fonts/`.
 * Run in parallel, which one finished first decided it.
 */
export async function loadAfterAssets<T>(install: () => Promise<void>, load: () => Promise<T>): Promise<T> {
  await install();
  return load();
}
