import { createDataSource, type DataSource, type DataSourceOptions } from "./dataSource";
import { fetchJson, type FetchJsonOptions } from "./fetchJson";

export type JsonDataSourceOptions = DataSourceOptions & Omit<FetchJsonOptions, "signal">;

export function createJsonDataSource<T>(url: string, options: JsonDataSourceOptions = {}): DataSource<T> {
  const { intervalMs, clock, ...fetchOptions } = options;
  return createDataSource<T>(
    (signal) => fetchJson<T>(url, { ...fetchOptions, signal }),
    { intervalMs, clock },
  );
}
