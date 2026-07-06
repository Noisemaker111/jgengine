export type AssetProvider = "kenney" | "quaternius" | "kaykit" | "polypizza" | "itch" | "custom";

export interface PinnedDownload {
  url: string;
  sha256?: string;
}

export interface ScrapeDownload {
  scrape: string;
}

export type AssetDownload = PinnedDownload | ScrapeDownload;

export function isScrapeDownload(download: AssetDownload): download is ScrapeDownload {
  return "scrape" in download;
}

export interface AssetSource {
  id: string;
  provider: AssetProvider;
  title: string;
  license: string;
  author: string;
  categories: readonly string[];
  download: AssetDownload;
  homepage?: string;
}

export interface IndexEntry {
  id: string;
  source: string;
  categories: readonly string[];
  file: string;
}

export interface AssetAlias {
  key: string;
  target: string;
}

export interface SingleAsset {
  id: string;
  url: string;
  license: string;
  author: string;
  categories: readonly string[];
}
