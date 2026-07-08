import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backupFile,
  canonical,
  diffAll,
  mapsEqual,
  planSync,
  serversEqual,
} from "../src/core.js";
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
const defB: ClientDef = { ...defA, id: "b", name: "Client B", supportsRemote: false };

const stdio = (cmd: string, args: string[] = []): McpServer => ({
  type: "stdio",
  command: cmd,
  args,
});
const remote = (url: string): McpServer => ({ type: "http", url });

describe("equality", () => {
  it("treats identical servers as equal regardless of env key order", () => {
    const x: McpServer = { type: "stdio", command: "npx", env: { A: "1", B: "2" } };
    const y: McpServer = { type: "stdio", command: "npx", env: { B: "2", A: "1" } };
    expect(serversEqual(x, y)).toBe(true);
  });

  it("distinguishes differing args order", () => {
    expect(serversEqual(stdio("npx", ["a", "b"]), stdio("npx", ["b", "a"]))).toBe(false);
  });

  it("compares maps", () => {
    expect(mapsEqual({ s: stdio("npx") }, { s: stdio("npx") })).toBe(true);
    expect(mapsEqual({ s: stdio("npx") }, {})).toBe(false);
  });
});

describe("planSync", () => {
  const target = (servers: Record<string, McpServer>, def = defA): ClientState => ({
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
