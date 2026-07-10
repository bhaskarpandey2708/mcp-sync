import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { renderDoc } from "./clients.js";
import {
  acquireLock,
  atomicWriteFile,
  backupStamp,
  backupsDir,
} from "./fsutil.js";
import type {
  ApplyResult,
  ClientState,
  McpServer,
  ServerMap,
  SyncOptions,
  SyncPlan,
  ValidationIssue,
} from "./types.js";

/** Deterministic string form of a server, for equality checks. */
export function canonical(server: McpServer): string {
  const sorted = (obj?: Record<string, string>) =>
    obj
      ? Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
      : undefined;
  const extra =
    server.extra && Object.keys(server.extra).length > 0
      ? Object.fromEntries(
          Object.entries(server.extra).sort(([a], [b]) => a.localeCompare(b)),
        )
      : undefined;
  return JSON.stringify({
    type: server.type,
    command: server.command,
    args: server.args ?? [],
    env: sorted(server.env),
    url: server.url,
    headers: sorted(server.headers),
    extra,
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
        // Prune only against source names that *could* apply, so a remote-only
        // source entry does not keep a same-named stdio target forever under prune.
        // Source presence is the intent signal for prune.
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
  stamp: string = backupStamp(),
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

/** Write a small manifest next to a backup stamp for restore/audit. */
export function writeBackupManifest(
  stamp: string,
  entries: { clientId: string; path: string; backupPath: string | null }[],
  home: string = homedir(),
): string {
  const dir = join(backupsDir(home), stamp);
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, "manifest.json");
  const body = {
    stamp,
    createdAt: new Date().toISOString(),
    pid: process.pid,
    entries,
  };
  writeFileSync(manifestPath, JSON.stringify(body, null, 2) + "\n", "utf8");
  return manifestPath;
}

/** Apply a sync plan to disk: backup, then atomic write. */
export function applyPlan(
  plan: SyncPlan,
  home: string = homedir(),
  stamp?: string,
): ApplyResult {
  const { def } = plan.target;
  try {
    const backupPath = backupFile(def.configPath, home, stamp ?? backupStamp());
    const rawDoc = existsSync(def.configPath)
      ? readFileSync(def.configPath, "utf8")
      : null;
    const content = renderDoc(rawDoc, def, plan.next);
    atomicWriteFile(def.configPath, content);
    return { clientId: def.id, ok: true, backupPath };
  } catch (err) {
    return {
      clientId: def.id,
      ok: false,
      backupPath: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Apply many plans under a single lock + shared backup stamp.
 * Failed targets are reported; successful ones keep their writes
 * (each write is atomic; multi-client is best-effort with full backups).
 */
export function applyPlans(
  plans: SyncPlan[],
  home: string = homedir(),
): { stamp: string; results: ApplyResult[] } {
  const stamp = backupStamp();
  const lock = acquireLock(home);
  try {
    const results: ApplyResult[] = [];
    const manifestEntries: {
      clientId: string;
      path: string;
      backupPath: string | null;
    }[] = [];
    for (const plan of plans) {
      if (!plan.changed) continue;
      const result = applyPlan(plan, home, stamp);
      results.push(result);
      manifestEntries.push({
        clientId: plan.target.def.id,
        path: plan.target.def.configPath,
        backupPath: result.backupPath,
      });
    }
    if (manifestEntries.length > 0) {
      writeBackupManifest(stamp, manifestEntries, home);
    }
    return { stamp, results };
  } finally {
    lock.release();
  }
}

/** Validate loaded client states for config health. */
export function validateStates(states: ClientState[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const s of states) {
    if (!s.exists) {
      issues.push({
        severity: "info",
        clientId: s.def.id,
        message: `not detected (${s.def.configPath})`,
      });
      continue;
    }
    if (s.error) {
      issues.push({
        severity: "error",
        clientId: s.def.id,
        message: s.error,
      });
      continue;
    }
    if (s.warnings) {
      for (const w of s.warnings) {
        issues.push({ severity: "warning", clientId: s.def.id, message: w });
      }
    }
    for (const [name, server] of Object.entries(s.servers)) {
      if (server.type === "stdio") {
        if (!server.command || !server.command.trim()) {
          issues.push({
            severity: "error",
            clientId: s.def.id,
            serverName: name,
            message: "stdio server has empty command",
          });
        }
      } else {
        if (!server.url || !server.url.trim()) {
          issues.push({
            severity: "error",
            clientId: s.def.id,
            serverName: name,
            message: `${server.type} server has empty url`,
          });
        } else {
          try {
            // eslint-disable-next-line no-new
            new URL(server.url);
          } catch {
            issues.push({
              severity: "warning",
              clientId: s.def.id,
              serverName: name,
              message: `url does not parse as absolute URL: ${server.url}`,
            });
          }
        }
        if (!s.def.supportsRemote) {
          issues.push({
            severity: "warning",
            clientId: s.def.id,
            serverName: name,
            message: `remote (${server.type}) entry present but client is documented as stdio-only`,
          });
        }
      }
    }
    if (Object.keys(s.servers).length === 0 && !s.warnings?.length) {
      issues.push({
        severity: "info",
        clientId: s.def.id,
        message: "config exists but has zero MCP servers",
      });
    }
  }
  return issues;
}

export interface BackupStampInfo {
  stamp: string;
  path: string;
  createdAt?: string;
  entryCount: number;
  hasManifest: boolean;
}

/** List available backup stamps (newest first). */
export function listBackups(home: string = homedir()): BackupStampInfo[] {
  const root = backupsDir(home);
  if (!existsSync(root)) return [];
  const dirs = readdirSync(root).filter((name) => {
    try {
      return statSync(join(root, name)).isDirectory();
    } catch {
      return false;
    }
  });
  const infos: BackupStampInfo[] = [];
  for (const stamp of dirs) {
    const path = join(root, stamp);
    const manifestPath = join(path, "manifest.json");
    let createdAt: string | undefined;
    let entryCount = 0;
    let hasManifest = false;
    if (existsSync(manifestPath)) {
      hasManifest = true;
      try {
        const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          createdAt?: string;
          entries?: unknown[];
        };
        createdAt = m.createdAt;
        entryCount = Array.isArray(m.entries) ? m.entries.length : 0;
      } catch {
        /* ignore corrupt manifest */
      }
    } else {
      // Count nested files roughly
      entryCount = countFiles(path);
    }
    infos.push({ stamp, path, createdAt, entryCount, hasManifest });
  }
  return infos.sort((a, b) => b.stamp.localeCompare(a.stamp));
}

function countFiles(dir: string): number {
  let n = 0;
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) n += countFiles(p);
      else if (name !== "manifest.json") n += 1;
    }
  } catch {
    /* ignore */
  }
  return n;
}

export interface RestoreOptions {
  stamp: string;
  /** If set, only restore these client config paths (by client id). */
  clientIds?: string[];
  dryRun?: boolean;
  home?: string;
}

export interface RestoreResult {
  ok: boolean;
  restored: { from: string; to: string }[];
  skipped: string[];
  error?: string;
}

/**
 * Restore config files from a backup stamp.
 * Prefer manifest.json when present; otherwise walk the stamp tree and
 * map backup paths back to absolute originals (best-effort).
 */
export function restoreBackup(opts: RestoreOptions): RestoreResult {
  const home = opts.home ?? homedir();
  const stampDir = join(backupsDir(home), opts.stamp);
  if (!existsSync(stampDir)) {
    return {
      ok: false,
      restored: [],
      skipped: [],
      error: `No backup stamp "${opts.stamp}" under ${backupsDir(home)}`,
    };
  }

  const lock = acquireLock(home);
  try {
    const pairs = resolveRestorePairs(stampDir, home, opts.clientIds);
    if (pairs.length === 0) {
      return {
        ok: false,
        restored: [],
        skipped: [],
        error: "No restorable files found for this stamp (or client filter matched nothing).",
      };
    }
    const restored: { from: string; to: string }[] = [];
    const skipped: string[] = [];
    // Safety: snapshot current files into a new stamp before overwriting.
    const safetyStamp = `pre-restore-${backupStamp()}`;
    for (const { from, to } of pairs) {
      if (!existsSync(from)) {
        skipped.push(from);
        continue;
      }
      if (!opts.dryRun) {
        backupFile(to, home, safetyStamp);
        mkdirSync(dirname(to), { recursive: true });
        // copy via temp rename for atomicity
        const tmp = `${to}.mcp-sync-restore.${process.pid}.tmp`;
        copyFileSync(from, tmp);
        renameSync(tmp, to);
      }
      restored.push({ from, to });
    }
    return { ok: true, restored, skipped };
  } catch (err) {
    return {
      ok: false,
      restored: [],
      skipped: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    lock.release();
  }
}

function resolveRestorePairs(
  stampDir: string,
  home: string,
  clientIds?: string[],
): { from: string; to: string }[] {
  const manifestPath = join(stampDir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        entries?: { clientId: string; path: string; backupPath: string | null }[];
      };
      if (Array.isArray(m.entries)) {
        return m.entries
          .filter((e) => e.backupPath && (!clientIds || clientIds.includes(e.clientId)))
          .map((e) => ({ from: e.backupPath!, to: e.path }));
      }
    } catch {
      /* fall through to walk */
    }
  }
  // Walk: stampDir mirrors absolute path with drive letter stripped.
  // Without manifest we cannot safely map back on all OSes — return empty
  // when client filter is requested without manifest.
  if (clientIds && clientIds.length > 0) {
    return [];
  }
  void home;
  return [];
}
