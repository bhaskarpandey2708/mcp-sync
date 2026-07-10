/**
 * Low-level filesystem helpers: atomic writes, exclusive lock, safe paths.
 * Node built-ins only — zero runtime deps.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** Write `content` to `filePath` via temp file + rename (atomic on same FS). */
export function atomicWriteFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.mcp-sync.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

/** Default state root under the user home. */
export function stateDir(home: string = homedir()): string {
  return join(home, ".mcp-sync");
}

export function backupsDir(home: string = homedir()): string {
  return join(stateDir(home), "backups");
}

export function lockPath(home: string = homedir()): string {
  return join(stateDir(home), "mcp-sync.lock");
}

export interface LockHandle {
  release: () => void;
}

/**
 * Acquire an exclusive lock for multi-file operations.
 * Stale locks (dead PID, or age > maxAgeMs) are broken automatically.
 */
export function acquireLock(
  home: string = homedir(),
  opts: { maxAgeMs?: number; staleOk?: boolean } = {},
): LockHandle {
  const maxAgeMs = opts.maxAgeMs ?? 30 * 60 * 1000; // 30 min
  const path = lockPath(home);
  mkdirSync(dirname(path), { recursive: true });

  const tryCreate = (): boolean => {
    try {
      // wx = exclusive create; fails if exists
      const fd = openSync(path, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      closeSync(fd);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") return false;
      throw err;
    }
  };

  if (!tryCreate()) {
    let stale = false;
    try {
      const raw = readFileSync(path, "utf8");
      const meta = JSON.parse(raw) as { pid?: number; at?: string };
      const age = meta.at ? Date.now() - Date.parse(meta.at) : Infinity;
      const dead =
        typeof meta.pid === "number" && meta.pid > 0
          ? !isPidAlive(meta.pid)
          : true;
      stale = dead || age > maxAgeMs;
    } catch {
      stale = true;
    }
    if (stale || opts.staleOk) {
      try {
        unlinkSync(path);
      } catch {
        /* race: another process may have removed it */
      }
      if (!tryCreate()) {
        throw new Error(
          `Could not acquire mcp-sync lock at ${path} (another instance is running).`,
        );
      }
    } else {
      throw new Error(
        `mcp-sync is already running (lock: ${path}). If this is stale, delete the lock file and retry.`,
      );
    }
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      try {
        unlinkSync(path);
      } catch {
        /* ignore */
      }
    },
  };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** ISO-ish stamp safe for directory names. */
export function backupStamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
