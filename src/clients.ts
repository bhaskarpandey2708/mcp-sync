import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type {
  ClientDef,
  ClientState,
  McpServer,
  ServerMap,
  TransportType,
} from "./types.js";

/** Keys we model explicitly; everything else goes into `extra`. */
const KNOWN_KEYS = new Set([
  "type",
  "command",
  "args",
  "env",
  "url",
  "headers",
]);

/** Platform-appropriate application-data directory. */
export function appDataDir(home: string = homedir()): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ?? join(home, "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

/**
 * Registry of supported clients. Paths are resolved for the current platform.
 * `home`/`data` are injectable for tests.
 */
export function getClients(
  home: string = homedir(),
  data: string = appDataDir(home),
): ClientDef[] {
  return [
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      configPath: join(data, "Claude", "claude_desktop_config.json"),
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: false,
      docsUrl: "https://modelcontextprotocol.io/quickstart/user",
    },
    {
      id: "claude-code",
      name: "Claude Code",
      configPath: join(home, ".claude.json"),
      serversKey: "mcpServers",
      style: "typed",
      supportsRemote: true,
      docsUrl: "https://code.claude.com/docs/en/mcp",
    },
    {
      id: "cursor",
      name: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: true,
      docsUrl: "https://docs.cursor.com/context/mcp",
    },
    {
      id: "vscode",
      name: "VS Code",
      configPath: join(data, "Code", "User", "mcp.json"),
      serversKey: "servers",
      style: "typed",
      supportsRemote: true,
      docsUrl:
        "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
    },
    {
      id: "windsurf",
      name: "Windsurf",
      configPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: false,
      docsUrl: "https://docs.windsurf.com/windsurf/cascade/mcp",
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      configPath: join(home, ".gemini", "settings.json"),
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: true,
      docsUrl:
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
    },
    {
      id: "copilot-cli",
      name: "GitHub Copilot CLI",
      configPath: join(home, ".copilot", "mcp-config.json"),
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: true,
      docsUrl: "https://docs.github.com/copilot",
    },
  ];
}

/** Convert a raw config entry (any client) into the canonical form. */
export function normalizeEntry(raw: unknown): McpServer | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : undefined;
  const command = typeof r.command === "string" ? r.command : undefined;
  if (!url && !command) return null;

  let type: TransportType;
  if (r.type === "stdio" || r.type === "http" || r.type === "sse") {
    type = r.type;
  } else {
    type = url ? "http" : "stdio";
  }

  const server: McpServer = { type };
  if (type === "stdio") {
    server.command = command;
    if (Array.isArray(r.args) && r.args.every((a) => typeof a === "string")) {
      server.args = r.args as string[];
    }
    if (isStringRecord(r.env)) server.env = r.env;
  } else {
    server.url = url;
    if (isStringRecord(r.headers)) server.headers = r.headers;
  }

  // Preserve unknown / client-specific keys so round-trips never strip config.
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (KNOWN_KEYS.has(k)) continue;
    extra[k] = v;
  }
  if (Object.keys(extra).length > 0) server.extra = extra;

  return server;
}

/** Convert a canonical server back into a client-specific raw entry. */
export function denormalizeEntry(
  server: McpServer,
  style: "plain" | "typed",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Typed clients always carry an explicit type. Plain clients usually omit it
  // for stdio/http (inferred from command/url), but must keep `sse` explicit —
  // otherwise a round-trip re-infers url-only entries as http and loses sse.
  if (style === "typed" || server.type === "sse") {
    out.type = server.type;
  }
  if (server.type === "stdio") {
    out.command = server.command;
    if (server.args && server.args.length > 0) out.args = server.args;
    if (server.env && Object.keys(server.env).length > 0) out.env = server.env;
  } else {
    out.url = server.url;
    if (server.headers && Object.keys(server.headers).length > 0) {
      out.headers = server.headers;
    }
  }
  if (server.extra) {
    for (const [k, v] of Object.entries(server.extra)) {
      // Never let extra overwrite modeled keys.
      if (KNOWN_KEYS.has(k)) continue;
      out[k] = v;
    }
  }
  return out;
}

export interface ParseResult {
  servers: ServerMap;
  warnings: string[];
}

/** Parse the server map out of a client config document. */
export function parseServers(rawDoc: string, def: ClientDef): ParseResult {
  const warnings: string[] = [];
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(rawDoc) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const section = doc[def.serversKey];
  const servers: ServerMap = {};
  if (section === undefined || section === null) {
    warnings.push(`no "${def.serversKey}" section found`);
    return { servers, warnings };
  }
  if (typeof section !== "object" || Array.isArray(section)) {
    warnings.push(`"${def.serversKey}" is not an object — ignored`);
    return { servers, warnings };
  }

  for (const [name, entry] of Object.entries(section)) {
    if (!name.trim()) {
      warnings.push("skipped server with empty name");
      continue;
    }
    const normalized = normalizeEntry(entry);
    if (normalized) {
      servers[name] = normalized;
    } else {
      warnings.push(`skipped invalid server entry "${name}" (need command or url)`);
    }
  }
  return { servers, warnings };
}

/**
 * Render an updated config document: replaces only the servers key,
 * preserving every other key in the file (critical for ~/.claude.json
 * and ~/.gemini/settings.json which hold unrelated state).
 */
export function renderDoc(
  rawDoc: string | null,
  def: ClientDef,
  servers: ServerMap,
): string {
  const doc: Record<string, unknown> = rawDoc
    ? (JSON.parse(rawDoc) as Record<string, unknown>)
    : {};
  const section: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    section[name] = denormalizeEntry(server, def.style);
  }
  doc[def.serversKey] = section;
  return JSON.stringify(doc, null, 2) + "\n";
}

/** Read a client's on-disk state. Never throws. */
export function loadClientState(def: ClientDef): ClientState {
  if (!existsSync(def.configPath)) {
    return { def, exists: false, servers: {} };
  }
  try {
    const raw = readFileSync(def.configPath, "utf8");
    const { servers, warnings } = parseServers(raw, def);
    return {
      def,
      exists: true,
      servers,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    return {
      def,
      exists: true,
      servers: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === "string")
  );
}
