/** Transport type for an MCP server. */
export type TransportType = "stdio" | "http" | "sse";

/** Canonical, client-agnostic representation of one MCP server entry. */
export interface McpServer {
  type: TransportType;
  /** stdio only */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http / sse only */
  url?: string;
  headers?: Record<string, string>;
}

/** Server name -> canonical definition. */
export type ServerMap = Record<string, McpServer>;

/** How a client's config file stores server entries. */
export interface ClientDef {
  id: string;
  name: string;
  /** Absolute path to the client's MCP config file. */
  configPath: string;
  /** Top-level JSON key that holds the server map ("mcpServers" or "servers"). */
  serversKey: string;
  /**
   * "plain"  – entries look like { command, args, env } / { url }
   * "typed"  – entries carry an explicit "type" field (VS Code, Claude Code)
   */
  style: "plain" | "typed";
  /** Whether the client supports remote (http/sse) servers in this config file. */
  supportsRemote: boolean;
  docsUrl: string;
}

/** A client definition plus what we found on disk. */
export interface ClientState {
  def: ClientDef;
  /** Config file exists on disk. */
  exists: boolean;
  servers: ServerMap;
  /** Parse/read error, if any. */
  error?: string;
}

/** Options for a sync operation. */
export interface SyncOptions {
  /** Replace the target server map entirely instead of merging. */
  replace: boolean;
  /** When merging, also delete target servers that are absent from the source. */
  prune: boolean;
}

/** Result of planning a sync against one target client. */
export interface SyncPlan {
  target: ClientState;
  /** The server map the target should end up with. */
  next: ServerMap;
  /** Names added / updated / removed relative to the target's current map. */
  added: string[];
  updated: string[];
  removed: string[];
  /** Remote servers skipped because the target doesn't support them. */
  skippedRemote: string[];
  /** True if next differs from current. */
  changed: boolean;
}
