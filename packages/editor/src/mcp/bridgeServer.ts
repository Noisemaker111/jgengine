import type { EditorHostApi } from "../session";

export interface EditorBridgeServerOptions {
  host: EditorHostApi;
  port?: number;
  hostname?: string;
}

export interface EditorBridgeServer {
  port: number;
  url: string;
  stop: () => void;
}
