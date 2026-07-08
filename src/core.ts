import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { renderDoc } from "./clients.js";
import type {
  ClientState,
  McpServer,
  ServerMap,
  SyncOptions,
  SyncPlan,
} from "./types.js";

/** Deterministic string form of a server, for equality checks. */
export function canonical(server: McpServer): string {
  const sorted = (obj?: Record<string, string>) =>
    obj
      ? Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
      : undefined;
  return JSON.stringify({
    type: server.type,
    command: server.command,
    args: server.args ?? [],
    env: sorted(server.env),
    url: server.url,
    headers: sorted(server.headers),
  });
}

export function serversEqual(a: McpServer, b: McpServer): boolean {
  return canonical(a) === canonical(b);
}

export function mapsEqual(a: ServerMap, b: ServerMap): boolean {
  const an = Object.keys(a).sort();
  const bn = Object.keys(b).sort();
  if (an.length !== bn.length) return false;
  return an.every((n, i) => n === bn[i] && serversEqual(a[n]!, b[bn[i]!]!));
}

/**
 * Plan what a target client's server map should become, given a source map.
 * Default: merge (source wins on name collisions, extra target servers kept).
 */
export function planSync(
  source: ServerMap,
  target: ClientState,
  opts: SyncOptions,
): SyncPlan {
  const skippedRemote: string[] = [];
  const applicable: ServerMap = {};
  for (const [name, server] of Object.entries(source)) {
    if (server.type !== "stdio" && !target.def.supportsRemote) {
      skippedRemote.push(name);
    } else {
      applicable[name] = server;
    }
  }

  let next: ServerMap;
  if (opts.replace) {
    next = { ...applicable };
  } else {
    next = { ...target.servers, ...applicable };
    if (opts.prune) {
      for (const name of Object.keys(next)) {
        if (!(name in source)) delete next[name];
      }
    }
  }

  const added = Object.keys(next).filter((n) => !(n in target.servers));
  const updated = Object.keys(next).filter(
    (n) => n in target.servers && !serversEqual(next[n]!, target.servers[n]!),
  );
  const removed = Object.keys(target.servers).filter((n) => !(n in next));

  return {
    target,
    next,
    added,
    updated,
    removed,
    skippedRemote,
    changed: !mapsEqual(next, target.servers),
  };
}

/** One row of a cross-client diff: which clients share which value. */
export interface DiffRow {
  name: string;
  /** canonical value -> client ids that have it */
  groups: Map<string, { server: McpServer; clientIds: string[] }>;
  /** client ids missing this server entirely */
  missingFrom: string[];
  /** true when every detected client has an identical entry */
  inSync: boolean;
}

/** Compute per-server drift across all detected clients. */
export function diffAll(states: ClientState[]): DiffRow[] {
  const detected = states.filter((s) => s.exists && !s.error);
  const names = new Set<string>();
  for (const s of detected) {
    for (const n of Object.keys(s.servers)) names.add(n);
  }

  const rows: DiffRow[] = [];
  for (const name of [...names].sort()) {
    const groups = new Map<string, { server: McpServer; clientIds: string[] }>();
    const missingFrom: string[] = [];
    for (const s of detected) {
      const server = s.servers[name];
      if (!server) {
        missingFrom.push(s.def.id);
        continue;
      }
      const key = canonical(server);
      const group = groups.get(key);
      if (group) group.clientIds.push(s.def.id);
      else groups.set(key, { server, clientIds: [s.def.id] });
    }
    rows.push({
      name,
      groups,
      missingFrom,
      inSync: groups.size === 1 && missingFrom.length === 0,
    });
  }
  return rows;
}

/**
 * Back up a config file into ~/.mcp-sync/backups/<timestamp>/ before writing.
 * Returns the backup path, or null when the file didn't exist yet.
 */
export function backupFile(
  filePath: string,
  home: string = homedir(),
  stamp: string = new Date().toISOString().replace(/[:.]/g, "-"),
): string | null {
  if (!existsSync(filePath)) return null;
  const relative = filePath
    .replace(/^[A-Za-z]:[\\/]/, "")
    .replace(/^[\\/]+/, "")
    .replaceAll("\\", "/");
  const dest = join(home, ".mcp-sync", "backups", stamp, relative);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(filePath, dest);
  return dest;
}

/** Apply a sync plan to disk: backup, then write the updated document. */
export function applyPlan(plan: SyncPlan, home: string = homedir()): {
  backupPath: string | null;
} {
  const { def } = plan.target;
  const backupPath = backupFile(def.configPath, home);
  const rawDoc = existsSync(def.configPath)
    ? readFileSync(def.configPath, "utf8")
    : null;
  mkdirSync(dirname(def.configPath), { recursive: true });
  writeFileSync(def.configPath, renderDoc(rawDoc, def, plan.next), "utf8");
  return { backupPath };
}
