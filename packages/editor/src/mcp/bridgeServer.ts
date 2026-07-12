import type { EditorHostApi } from "../session";

/** Options for starting the editor's HTTP bridge server: host api, port, hostname. */
export interface EditorBridgeServerOptions {
  host: EditorHostApi;
  port?: number;
  hostname?: string;
}

/** A running editor bridge server: its bound port, URL, and a stop handle. */
export interface EditorBridgeServer {
  port: number;
  url: string;
  stop: () => void;
}
