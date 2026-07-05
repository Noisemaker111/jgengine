export type SceneAssetFetcher = (url: string) => void;

export function createSceneAssetPreloader(fetcher: SceneAssetFetcher) {
  const preloadedUrls = new Set<string>();

  return {
    preloadUrl(url: string): void {
      if (preloadedUrls.has(url)) return;
      preloadedUrls.add(url);
      fetcher(url);
    },
    preloadUrls(urls: readonly string[]): void {
      for (const url of urls) {
        this.preloadUrl(url);
      }
    },
    hasPreloaded(url: string): boolean {
      return preloadedUrls.has(url);
    },
    reset(): void {
      preloadedUrls.clear();
    },
  };
}