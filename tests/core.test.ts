import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPlan,
  applyPlans,
  backupFile,
  canonical,
  diffAll,
  listBackups,
  mapsEqual,
  planSync,
  restoreBackup,
  serversEqual,
  validateStates,
} from "../src/core.js";
import { atomicWriteFile, acquireLock } from "../src/fsutil.js";
import type { ClientDef, ClientState, McpServer } from "../src/types.js";

const defA: ClientDef = {
  id: "a",
  name: "Client A",
  configPath: "/tmp/a.json",
  serversKey: "mcpServers",
  style: "plain",
  supportsRemote: true,
  docsUrl: "",
};
const defB: ClientDef = {
  ...defA,
  id: "b",
  name: "Client B",
  supportsRemote: false,
};

const stdio = (cmd: string, args: string[] = []): McpServer => ({
  type: "stdio",
  command: cmd,
  args,
});
const remote = (url: string): McpServer => ({ type: "http", url });

describe("equality", () => {
  it("treats identical servers as equal regardless of env key order", () => {
    const x: McpServer = {
      type: "stdio",
      command: "npx",
      env: { A: "1", B: "2" },
    };
    const y: McpServer = {
      type: "stdio",
      command: "npx",
      env: { B: "2", A: "1" },
    };
    expect(serversEqual(x, y)).toBe(true);
  });

  it("distinguishes differing args order", () => {
    expect(
      serversEqual(stdio("npx", ["a", "b"]), stdio("npx", ["b", "a"])),
    ).toBe(false);
  });

  it("includes extra fields in equality", () => {
    const x: McpServer = { type: "stdio", command: "npx", extra: { cwd: "/a" } };
    const y: McpServer = { type: "stdio", command: "npx", extra: { cwd: "/b" } };
    expect(serversEqual(x, y)).toBe(false);
  });

  it("compares maps", () => {
    expect(mapsEqual({ s: stdio("npx") }, { s: stdio("npx") })).toBe(true);
    expect(mapsEqual({ s: stdio("npx") }, {})).toBe(false);
  });
});

describe("planSync", () => {
  const target = (
    servers: Record<string, McpServer>,
    def = defA,
  ): ClientState => ({
    def,
    exists: true,
    servers,
  });

  it("merges by default: source wins, extras kept", () => {
    const plan = planSync(
      { github: stdio("npx", ["gh-v2"]) },
      target({ github: stdio("npx", ["gh-v1"]), extra: stdio("node") }),
      { replace: false, prune: false },
    );
    expect(plan.updated).toEqual(["github"]);
    expect(plan.removed).toEqual([]);
    expect(Object.keys(plan.next).sort()).toEqual(["extra", "github"]);
    expect(plan.changed).toBe(true);
  });

  it("prune removes servers absent from source", () => {
    const plan = planSync(
      { github: stdio("npx") },
      target({ github: stdio("npx"), stale: stdio("node") }),
      { replace: false, prune: true },
    );
    expect(plan.removed).toEqual(["stale"]);
    expect(Object.keys(plan.next)).toEqual(["github"]);
  });

  it("replace makes target exactly match source", () => {
    const plan = planSync(
      { only: stdio("npx") },
      target({ other: stdio("node") }),
      { replace: true, prune: false },
    );
    expect(Object.keys(plan.next)).toEqual(["only"]);
    expect(plan.removed).toEqual(["other"]);
  });

  it("skips remote servers for clients without remote support", () => {
    const plan = planSync(
      { api: remote("https://example.com/mcp"), fs: stdio("npx") },
      target({}, defB),
      { replace: false, prune: false },
    );
    expect(plan.skippedRemote).toEqual(["api"]);
    expect(Object.keys(plan.next)).toEqual(["fs"]);
  });

  it("reports no change when already in sync", () => {
    const plan = planSync({ s: stdio("npx") }, target({ s: stdio("npx") }), {
      replace: false,
      prune: false,
    });
    expect(plan.changed).toBe(false);
  });
});

describe("diffAll", () => {
  it("groups clients by identical value and finds drift", () => {
    const states: ClientState[] = [
      { def: defA, exists: true, servers: { s: stdio("npx", ["v1"]) } },
      { def: defB, exists: true, servers: { s: stdio("npx", ["v2"]) } },
      { def: { ...defA, id: "c" }, exists: false, servers: {} },
    ];
    const rows = diffAll(states);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.inSync).toBe(false);
    expect(rows[0]!.groups.size).toBe(2);
    expect(rows[0]!.missingFrom).toEqual([]);
  });

  it("flags servers missing from some clients", () => {
    const states: ClientState[] = [
      { def: defA, exists: true, servers: { s: stdio("npx") } },
      { def: defB, exists: true, servers: {} },
    ];
    const rows = diffAll(states);
    expect(rows[0]!.missingFrom).toEqual(["b"]);
    expect(rows[0]!.inSync).toBe(false);
  });

  it("reports full sync", () => {
    const states: ClientState[] = [
      { def: defA, exists: true, servers: { s: stdio("npx") } },
      { def: defB, exists: true, servers: { s: stdio("npx") } },
    ];
    expect(diffAll(states)[0]!.inSync).toBe(true);
  });
});

describe("backupFile", () => {
  it("copies the file into ~/.mcp-sync/backups preserving structure", () => {
    const home = mkdtempSync(join(tmpdir(), "mcp-sync-home-"));
    const src = join(home, ".cursor", "mcp.json");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(src, '{"mcpServers":{}}');
    const dest = backupFile(src, home, "2026-07-08T00-00-00-000Z");
    expect(dest).toBeTruthy();
    expect(readFileSync(dest!, "utf8")).toBe('{"mcpServers":{}}');
    expect(dest).toContain(join(home, ".mcp-sync", "backups"));
  });

  it("returns null for missing files", () => {
    expect(backupFile("/nonexistent/nope.json")).toBeNull();
  });
});

describe("canonical", () => {
  it("is stable", () => {
    expect(canonical(stdio("npx", ["a"]))).toBe(canonical(stdio("npx", ["a"])));
  });
});

describe("atomicWriteFile", () => {
  it("writes content that can be read back", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-sync-atomic-"));
    const path = join(dir, "nested", "cfg.json");
    atomicWriteFile(path, '{"ok":true}\n');
    expect(readFileSync(path, "utf8")).toBe('{"ok":true}\n');
  });
});

describe("acquireLock", () => {
  it("prevents concurrent acquisition and releases cleanly", () => {
    const home = mkdtempSync(join(tmpdir(), "mcp-sync-lock-"));
    const a = acquireLock(home);
    expect(() => acquireLock(home)).toThrow(/already running|Could not acquire/);
    a.release();
    const b = acquireLock(home);
    b.release();
  });
});

describe("applyPlan / applyPlans", () => {
  it("atomically writes and backs up under a shared stamp", () => {
    const home = mkdtempSync(join(tmpdir(), "mcp-sync-apply-"));
    const cfg = join(home, ".cursor", "mcp.json");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(
      cfg,
      JSON.stringify({ mcpServers: { old: { command: "node" } } }, null, 2),
    );

    const def: ClientDef = {
      id: "cursor",
      name: "Cursor",
      configPath: cfg,
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: true,
      docsUrl: "",
    };
    const state: ClientState = {
      def,
      exists: true,
      servers: { old: stdio("node") },
    };
    const plan = planSync(
      { fs: stdio("npx", ["-y", "fs"]) },
      state,
      { replace: false, prune: false },
    );
    const { stamp, results } = applyPlans([plan], home);
    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(true);
    expect(results[0]!.backupPath).toBeTruthy();

    const written = JSON.parse(readFileSync(cfg, "utf8"));
    expect(written.mcpServers.fs.command).toBe("npx");
    expect(written.mcpServers.old.command).toBe("node");

    const backups = listBackups(home);
    expect(backups.some((b) => b.stamp === stamp)).toBe(true);
    expect(existsSync(join(home, ".mcp-sync", "backups", stamp, "manifest.json"))).toBe(
      true,
    );
  });

  it("applyPlan returns error result instead of throwing on bad path parent", () => {
    // Use a path where parent is a file → mkdir fails
    const home = mkdtempSync(join(tmpdir(), "mcp-sync-fail-"));
    const blocker = join(home, "blocker");
    writeFileSync(blocker, "not-a-dir");
    const def: ClientDef = {
      id: "x",
      name: "X",
      configPath: join(blocker, "mcp.json"),
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: true,
      docsUrl: "",
    };
    const plan = planSync(
      { s: stdio("npx") },
      { def, exists: false, servers: {} },
      { replace: false, prune: false },
    );
    const result = applyPlan(plan, home);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("validateStates", () => {
  it("flags empty commands and remote on stdio-only clients", () => {
    const issues = validateStates([
      {
        def: defB,
        exists: true,
        servers: {
          bad: { type: "stdio", command: "  " },
          remote: remote("https://example.com"),
        },
      },
      {
        def: defA,
        exists: true,
        servers: { ok: stdio("npx") },
        warnings: ['skipped invalid server entry "ghost"'],
      },
    ]);
    expect(issues.some((i) => i.severity === "error" && i.serverName === "bad")).toBe(
      true,
    );
    expect(
      issues.some(
        (i) => i.severity === "warning" && i.message.includes("stdio-only"),
      ),
    ).toBe(true);
    expect(issues.some((i) => i.message.includes("ghost"))).toBe(true);
  });
});

describe("restoreBackup", () => {
  it("restores from a stamp via manifest after applyPlans", () => {
    const home = mkdtempSync(join(tmpdir(), "mcp-sync-restore-"));
    const cfg = join(home, ".cursor", "mcp.json");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const original = JSON.stringify(
      { mcpServers: { original: { command: "node" } } },
      null,
      2,
    );
    writeFileSync(cfg, original);

    const def: ClientDef = {
      id: "cursor",
      name: "Cursor",
      configPath: cfg,
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: true,
      docsUrl: "",
    };
    const state: ClientState = {
      def,
      exists: true,
      servers: { original: stdio("node") },
    };
    const plan = planSync(
      { fs: stdio("npx") },
      state,
      { replace: true, prune: false },
    );
    const { stamp } = applyPlans([plan], home);
    expect(JSON.parse(readFileSync(cfg, "utf8")).mcpServers.fs).toBeTruthy();

    const result = restoreBackup({ stamp, home });
    expect(result.ok).toBe(true);
    expect(result.restored.length).toBe(1);
    expect(JSON.parse(readFileSync(cfg, "utf8")).mcpServers.original.command).toBe(
      "node",
    );
  });
});
