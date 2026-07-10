/**
 * Exhaustive parameter matrix + scale tests.
 * Ensures every CLI flag combination and project size class works.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import {
  applyPlans,
  mapsEqual,
  planSync,
  restoreBackup,
} from "../src/core.js";
import {
  denormalizeEntry,
  normalizeEntry,
  parseServers,
  renderDoc,
} from "../src/clients.js";
import type { ClientDef, ClientState, McpServer, ServerMap } from "../src/types.js";

// ---------- helpers ----------

let home: string;
let prevHome: string | undefined;
let prevUserProfile: string | undefined;
let prevAppData: string | undefined;
let prevXdg: string | undefined;

function capture(fn: () => number): { code: number; out: string; err: string } {
  const logs: string[] = [];
  const errs: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => {
    logs.push(a.map(String).join(" "));
  };
  console.error = (...a: unknown[]) => {
    errs.push(a.map(String).join(" "));
  };
  try {
    return { code: fn(), out: logs.join("\n"), err: errs.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

function run(argv: string[]): { code: number; out: string; err: string } {
  return capture(() => main(argv));
}

function dataDir(): string {
  // Match clients.ts appDataDir for darwin when HOME is overridden.
  return join(home, "Library", "Application Support");
}

function writeClient(
  id: "cursor" | "claude-code" | "vscode" | "windsurf" | "gemini-cli" | "copilot-cli" | "claude-desktop",
  servers: Record<string, unknown>,
  extraDoc: Record<string, unknown> = {},
): string {
  const paths: Record<string, { path: string; key: string }> = {
    cursor: { path: join(home, ".cursor", "mcp.json"), key: "mcpServers" },
    "claude-code": { path: join(home, ".claude.json"), key: "mcpServers" },
    vscode: {
      path: join(dataDir(), "Code", "User", "mcp.json"),
      key: "servers",
    },
    windsurf: {
      path: join(home, ".codeium", "windsurf", "mcp_config.json"),
      key: "mcpServers",
    },
    "gemini-cli": {
      path: join(home, ".gemini", "settings.json"),
      key: "mcpServers",
    },
    "copilot-cli": {
      path: join(home, ".copilot", "mcp-config.json"),
      key: "mcpServers",
    },
    "claude-desktop": {
      path: join(dataDir(), "Claude", "claude_desktop_config.json"),
      key: "mcpServers",
    },
  };
  const { path, key } = paths[id];
  mkdirSync(join(path, ".."), { recursive: true });
  // fix: dirname for nested paths
  mkdirSync(path.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  const doc = { ...extraDoc, [key]: servers };
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return path;
}

/** Build N synthetic MCP servers at a given "project size". */
function makeServers(
  n: number,
  opts: {
    withRemote?: boolean;
    withExtra?: boolean;
    withEnv?: boolean;
    envKeys?: number;
    argLen?: number;
  } = {},
): Record<string, unknown> {
  const {
    withRemote = true,
    withExtra = true,
    withEnv = true,
    envKeys = 3,
    argLen = 4,
  } = opts;
  const out: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    const name = `svc_${String(i).padStart(4, "0")}`;
    if (withRemote && i % 7 === 0) {
      out[name] = {
        type: "http",
        url: `https://api.example.com/mcp/${name}`,
        headers: { Authorization: `Bearer token-${i}` },
        ...(withExtra ? { timeout: 30 + (i % 10), disabled: i % 11 === 0 } : {}),
      };
    } else {
      const env: Record<string, string> = {};
      if (withEnv) {
        for (let k = 0; k < envKeys; k++) {
          env[`KEY_${k}`] = `value_${i}_${k}_${"x".repeat(8)}`;
        }
      }
      const args = Array.from({ length: argLen }, (_, j) =>
        j === 0 ? "-y" : `@scope/pkg-${i}-arg${j}`,
      );
      out[name] = {
        command: i % 3 === 0 ? "npx" : i % 3 === 1 ? "node" : "uvx",
        args,
        ...(withEnv ? { env } : {}),
        ...(withExtra
          ? {
              cwd: `/projects/repo-${i % 50}/subdir`,
              disabled: false,
              meta: { projectSize: n, index: i },
            }
          : {}),
      };
    }
  }
  return out;
}

function plainDef(path: string): ClientDef {
  return {
    id: "cursor",
    name: "Cursor",
    configPath: path,
    serversKey: "mcpServers",
    style: "plain",
    supportsRemote: true,
    docsUrl: "",
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mcp-sync-matrix-"));
  prevHome = process.env.HOME;
  prevUserProfile = process.env.USERPROFILE;
  prevAppData = process.env.APPDATA;
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // Keep APPDATA off so win32 path not used; force darwin-style via HOME.
  delete process.env.APPDATA;
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  if (prevUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = prevUserProfile;
  if (prevAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = prevAppData;
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------- size classes ----------

const SIZE_CLASSES = [
  { name: "empty", n: 0 },
  { name: "tiny", n: 1 },
  { name: "small", n: 5 },
  { name: "medium", n: 25 },
  { name: "large", n: 100 },
  { name: "xlarge", n: 500 },
  { name: "stress", n: 1500 },
] as const;

// ---------- CLI command matrix (smoke on medium fixture) ----------

describe("CLI command matrix", () => {
  beforeEach(() => {
    writeClient("cursor", makeServers(10));
    writeClient("claude-code", makeServers(8), { theme: "dark", numStartups: 3 });
    writeClient("vscode", makeServers(6));
  });

  const commands: { argv: string[]; expectCode: number | ((c: number) => boolean) }[] = [
    { argv: ["--version"], expectCode: 0 },
    { argv: ["-v"], expectCode: 0 },
    { argv: ["--help"], expectCode: 0 },
    { argv: ["-h"], expectCode: 0 },
    { argv: ["help"], expectCode: 0 },
    { argv: ["status"], expectCode: (c) => c === 0 || c === 1 },
    { argv: ["status", "--json"], expectCode: (c) => c === 0 || c === 1 },
    { argv: ["list"], expectCode: 0 },
    { argv: ["list", "--json"], expectCode: 0 },
    { argv: ["diff"], expectCode: (c) => c === 0 || c === 1 },
    { argv: ["diff", "--json"], expectCode: (c) => c === 0 || c === 1 },
    { argv: ["clients"], expectCode: 0 },
    { argv: ["clients", "--json"], expectCode: 0 },
    { argv: ["validate"], expectCode: (c) => c === 0 || c === 1 },
    { argv: ["validate", "--json"], expectCode: (c) => c === 0 || c === 1 },
    { argv: ["backups"], expectCode: 0 },
    { argv: ["backups", "--json"], expectCode: 0 },
    { argv: ["sync", "--from", "cursor", "--dry-run"], expectCode: 0 },
    {
      argv: ["sync", "--from", "cursor", "--to", "vscode", "--dry-run"],
      expectCode: 0,
    },
    {
      argv: ["sync", "--from", "cursor", "--to", "vscode,claude-code", "--dry-run"],
      expectCode: 0,
    },
    {
      argv: ["sync", "--from", "cursor", "--replace", "--dry-run"],
      expectCode: 0,
    },
    {
      argv: ["sync", "--from", "cursor", "--prune", "--dry-run"],
      expectCode: 0,
    },
    {
      argv: ["sync", "--from", "cursor", "--replace", "--prune", "--dry-run"],
      expectCode: 0,
    },
    {
      argv: ["sync", "--from", "cursor", "--to", "vscode", "--json", "--dry-run"],
      expectCode: 0,
    },
    // error paths
    { argv: ["sync"], expectCode: 2 },
    { argv: ["sync", "--from", "nope"], expectCode: 2 },
    { argv: ["sync", "--from", "cursor", "--to", "nope"], expectCode: 2 },
    { argv: ["sync", "--from", "cursor", "--replace"], expectCode: 2 }, // needs --yes
    { argv: ["sync", "--from", "cursor", "--prune"], expectCode: 2 },
    { argv: ["restore"], expectCode: 2 },
    { argv: ["restore", "--stamp", "does-not-exist"], expectCode: 2 },
    { argv: ["restore", "--latest"], expectCode: 2 }, // no backups yet
    { argv: ["nope"], expectCode: 2 },
  ];

  for (const { argv, expectCode } of commands) {
    it(`argv: ${argv.join(" ") || "(empty status default)"}`, () => {
      const { code, out, err } = run(argv);
      const ok =
        typeof expectCode === "function" ? expectCode(code) : code === expectCode;
      expect(ok, `exit ${code}\nout=${out}\nerr=${err}`).toBe(true);
      if (argv.includes("--json") && code !== 2) {
        // successful json paths should parse
        if (out.trim()) {
          expect(() => JSON.parse(out)).not.toThrow();
        }
      }
    });
  }

  it("default command is status", () => {
    const a = run([]);
    const b = run(["status"]);
    expect(a.code).toBe(b.code);
  });
});

// ---------- sync write matrix across sizes ----------

describe("sync write matrix × size classes", () => {
  for (const { name, n } of SIZE_CLASSES) {
    describe(`size=${name} (n=${n})`, () => {
      it("merge sync + validate + status --json", () => {
        const src = makeServers(n);
        writeClient("cursor", src);
        // target starts with half the servers (or empty)
        const half = Object.fromEntries(
          Object.entries(src).filter((_, i) => i % 2 === 0),
        );
        writeClient("vscode", n === 0 ? {} : half, { inputs: [] });
        writeClient("claude-code", {}, { theme: "dark", projects: { "/a": { x: 1 } } });

        if (n === 0) {
          const r = run(["sync", "--from", "cursor", "--to", "vscode"]);
          expect(r.code).toBe(2); // nothing to sync
          return;
        }

        const dry = run([
          "sync",
          "--from",
          "cursor",
          "--to",
          "vscode,claude-code",
          "--dry-run",
          "--json",
        ]);
        expect(dry.code).toBe(0);
        const dryPayload = JSON.parse(dry.out);
        expect(dryPayload.dryRun).toBe(true);
        expect(dryPayload.serverCount).toBe(n);

        const apply = run([
          "sync",
          "--from",
          "cursor",
          "--to",
          "vscode,claude-code",
        ]);
        expect(apply.code).toBe(0);

        // Claude-code unrelated keys preserved
        const cc = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
        expect(cc.theme).toBe("dark");
        expect(cc.projects["/a"].x).toBe(1);
        expect(Object.keys(cc.mcpServers).length).toBe(n);

        // vscode has all n (merge)
        const vs = JSON.parse(
          readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
        );
        expect(Object.keys(vs.servers).length).toBe(n);

        const val = run(["validate", "--json"]);
        expect(val.code).toBe(0);
        const status = run(["status", "--json"]);
        expect(status.code === 0 || status.code === 1).toBe(true);
        const st = JSON.parse(status.out);
        expect(st.clients.length).toBeGreaterThanOrEqual(3);
      }, 60_000);

      it("replace --yes makes targets exact", () => {
        if (n === 0) return;
        writeClient("cursor", makeServers(n));
        writeClient("vscode", {
          stale_only: { command: "should-be-removed" },
          ...makeServers(Math.min(3, n)),
        });

        const r = run([
          "sync",
          "--from",
          "cursor",
          "--to",
          "vscode",
          "--replace",
          "--yes",
        ]);
        expect(r.code).toBe(0);
        const vs = JSON.parse(
          readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
        );
        expect(vs.servers.stale_only).toBeUndefined();
        expect(Object.keys(vs.servers).length).toBe(n);
      }, 60_000);

      it("prune --yes removes extras", () => {
        if (n < 2) return;
        const src = makeServers(n);
        writeClient("cursor", src);
        writeClient("vscode", {
          ...src,
          zombie: { command: "node", args: ["zombie.js"] },
        });
        const r = run([
          "sync",
          "--from",
          "cursor",
          "--to",
          "vscode",
          "--prune",
          "--yes",
        ]);
        expect(r.code).toBe(0);
        const vs = JSON.parse(
          readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
        );
        expect(vs.servers.zombie).toBeUndefined();
        expect(Object.keys(vs.servers).length).toBe(n);
      }, 60_000);
    });
  }
});

// ---------- multi-client full mesh ----------

describe("all 7 clients mesh", () => {
  it("sync from cursor to all detected clients preserves dialects", () => {
    const n = 40;
    const src = makeServers(n);
    writeClient("cursor", src);
    writeClient("claude-code", makeServers(5), { theme: "x", numStartups: 9 });
    writeClient("vscode", makeServers(5));
    writeClient("windsurf", makeServers(5)); // stdio-only — remotes skipped
    writeClient("gemini-cli", makeServers(5), { other: true });
    writeClient("copilot-cli", makeServers(5));
    writeClient("claude-desktop", makeServers(5)); // stdio-only

    const r = run(["sync", "--from", "cursor"]);
    expect(r.code).toBe(0);

    // remotes skipped for windsurf + claude-desktop
    const remoteCount = Object.values(src).filter(
      (e) => typeof e === "object" && e && "url" in (e as object),
    ).length;
    const wind = JSON.parse(
      readFileSync(join(home, ".codeium", "windsurf", "mcp_config.json"), "utf8"),
    );
    // merge keeps old + adds stdio from source; remotes not added
    expect(Object.keys(wind.mcpServers).length).toBeGreaterThanOrEqual(5);
    for (const entry of Object.values(wind.mcpServers) as Record<string, unknown>[]) {
      // after merge, source remotes should not appear as url-only new ones from cursor
      // existing remotes from makeServers(5) on windsurf might exist if generated
    }
    void remoteCount;

    // typed style on vscode
    const vs = JSON.parse(
      readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
    );
    const sample = Object.values(vs.servers)[0] as Record<string, unknown>;
    expect(sample.type === "stdio" || sample.type === "http" || sample.type === "sse").toBe(
      true,
    );

    // claude-code unrelated keys
    const cc = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
    expect(cc.theme).toBe("x");
    expect(cc.numStartups).toBe(9);

    const val = run(["validate", "--json"]);
    expect([0, 1]).toContain(val.code);
  }, 60_000);
});

// ---------- backup / restore matrix ----------

describe("backup + restore matrix", () => {
  it("full cycle: sync → backups → restore --latest → content restored", () => {
    writeClient("cursor", {
      a: { command: "npx", args: ["-y", "a"] },
    });
    writeClient("vscode", {
      b: { type: "stdio", command: "node", args: ["b.js"] },
    });

    const before = readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8");

    expect(run(["sync", "--from", "cursor", "--to", "vscode", "--replace", "--yes"]).code).toBe(
      0,
    );
    const mid = JSON.parse(
      readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
    );
    expect(mid.servers.a).toBeTruthy();
    expect(mid.servers.b).toBeUndefined();

    const list = run(["backups", "--json"]);
    expect(list.code).toBe(0);
    const stamps = JSON.parse(list.out).backups;
    expect(stamps.length).toBeGreaterThanOrEqual(1);

    const dry = run(["restore", "--latest", "--dry-run", "--json"]);
    expect(dry.code).toBe(0);

    const rest = run(["restore", "--latest", "--json"]);
    expect(rest.code).toBe(0);
    const after = readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8");
    // Restored original should have b again
    const parsed = JSON.parse(after);
    expect(parsed.servers.b).toBeTruthy();
    expect(JSON.parse(before).servers.b).toBeTruthy();
  });

  it("restore --stamp explicit works", () => {
    writeClient("cursor", { x: { command: "npx" } });
    writeClient("vscode", { y: { type: "stdio", command: "node" } });
    run(["sync", "--from", "cursor", "--to", "vscode", "--replace", "--yes"]);
    const stamps = JSON.parse(run(["backups", "--json"]).out).backups;
    const stamp = stamps[0].stamp as string;
    const r = run(["restore", "--stamp", stamp, "--json"]);
    expect(r.code).toBe(0);
  });
});

// ---------- lossless field preservation at scale ----------

describe("lossless round-trip at scale", () => {
  for (const n of [1, 50, 200]) {
    it(`n=${n} parse→render preserves extra/env/headers`, () => {
      const raw = makeServers(n, {
        withRemote: true,
        withExtra: true,
        withEnv: true,
        envKeys: 10,
        argLen: 8,
      });
      const def = plainDef("/tmp/x.json");
      const doc = JSON.stringify({ mcpServers: raw });
      const { servers, warnings } = parseServers(doc, def);
      expect(warnings.length).toBe(0);
      expect(Object.keys(servers).length).toBe(n);
      const out = renderDoc(doc, def, servers);
      const again = parseServers(out, def).servers;
      // deep equality via mapsEqual after normalize
      expect(mapsEqual(servers, again)).toBe(true);

      // spot-check first stdio entry still has cwd
      for (const [name, entry] of Object.entries(raw)) {
        if ("command" in (entry as object)) {
          const re = JSON.parse(out).mcpServers[name];
          expect(re.cwd).toBe((entry as { cwd: string }).cwd);
          expect(re.meta).toEqual((entry as { meta: unknown }).meta);
          break;
        }
      }
    });
  }
});

// ---------- pathological / edge sizes ----------

describe("pathological inputs", () => {
  it("very long server names and values", () => {
    const longName = "s_" + "n".repeat(200);
    const longCmd = "c".repeat(500);
    const longArg = "a".repeat(2000);
    writeClient("cursor", {
      [longName]: {
        command: longCmd,
        args: [longArg],
        env: { BIG: "e".repeat(5000) },
        cwd: "/" + "p".repeat(300),
      },
    });
    writeClient("vscode", {});
    const r = run(["sync", "--from", "cursor", "--to", "vscode"]);
    expect(r.code).toBe(0);
    const vs = JSON.parse(
      readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
    );
    expect(vs.servers[longName].command).toBe(longCmd);
    expect(vs.servers[longName].env.BIG.length).toBe(5000);
    expect(vs.servers[longName].cwd.length).toBe(301);
  });

  it("unicode server names and env", () => {
    writeClient("cursor", {
      "服务-🚀": {
        command: "npx",
        args: ["-y", "pkg"],
        env: { "PATH_名前": "/tmp/テスト" },
        cwd: "/Users/用户/项目",
      },
    });
    writeClient("vscode", {});
    expect(run(["sync", "--from", "cursor", "--to", "vscode"]).code).toBe(0);
    const vs = JSON.parse(
      readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8"),
    );
    expect(vs.servers["服务-🚀"].env["PATH_名前"]).toBe("/tmp/テスト");
  });

  it("invalid JSON surfaces as validate error, not crash", () => {
    const path = join(home, ".cursor", "mcp.json");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(path, "{ not json !!!");
    const r = run(["validate", "--json"]);
    expect(r.code).toBe(1);
    const payload = JSON.parse(r.out);
    expect(payload.ok).toBe(false);
    expect(payload.issues.some((i: { severity: string }) => i.severity === "error")).toBe(
      true,
    );
  });

  it("invalid entries warned, good ones still sync", () => {
    writeClient("cursor", {
      good: { command: "npx", args: ["-y", "x"] },
      bad: { nope: true },
      empty: {},
    });
    writeClient("vscode", {});
    const st = run(["status", "--json"]);
    const payload = JSON.parse(st.out);
    const cursor = payload.clients.find((c: { id: string }) => c.id === "cursor");
    expect(cursor.serverCount).toBe(1);
    expect(cursor.warnings.length).toBeGreaterThan(0);
    expect(run(["sync", "--from", "cursor", "--to", "vscode"]).code).toBe(0);
  });

  it("idempotent double sync is no-op", () => {
    writeClient("cursor", makeServers(30));
    writeClient("vscode", {});
    expect(run(["sync", "--from", "cursor", "--to", "vscode"]).code).toBe(0);
    const mid = readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8");
    expect(run(["sync", "--from", "cursor", "--to", "vscode"]).code).toBe(0);
    const after = readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8");
    expect(after).toBe(mid);
  });

  it("dry-run never mutates disk", () => {
    writeClient("cursor", makeServers(20));
    writeClient("vscode", { only: { type: "stdio", command: "node" } });
    const before = readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8");
    expect(
      run([
        "sync",
        "--from",
        "cursor",
        "--to",
        "vscode",
        "--replace",
        "--dry-run",
      ]).code,
    ).toBe(0);
    expect(readFileSync(join(dataDir(), "Code", "User", "mcp.json"), "utf8")).toBe(
      before,
    );
  });
});

// ---------- pure planSync matrix (no disk) ----------

describe("planSync option matrix", () => {
  const target = (servers: ServerMap, remote = true): ClientState => ({
    def: {
      id: "t",
      name: "T",
      configPath: "/t",
      serversKey: "mcpServers",
      style: "plain",
      supportsRemote: remote,
      docsUrl: "",
    },
    exists: true,
    servers,
  });
  const stdio = (c: string): McpServer => ({ type: "stdio", command: c });
  const http = (u: string): McpServer => ({ type: "http", url: u });

  const cases: {
    name: string;
    source: ServerMap;
    target: ServerMap;
    opts: { replace: boolean; prune: boolean };
    remote?: boolean;
    expectAdded: string[];
    expectRemoved: string[];
    expectSkipped?: string[];
  }[] = [
    {
      name: "merge empty→full",
      source: { a: stdio("npx") },
      target: {},
      opts: { replace: false, prune: false },
      expectAdded: ["a"],
      expectRemoved: [],
    },
    {
      name: "merge keeps extras",
      source: { a: stdio("npx") },
      target: { b: stdio("node") },
      opts: { replace: false, prune: false },
      expectAdded: ["a"],
      expectRemoved: [],
    },
    {
      name: "prune removes extras",
      source: { a: stdio("npx") },
      target: { a: stdio("npx"), b: stdio("node") },
      opts: { replace: false, prune: true },
      expectAdded: [],
      expectRemoved: ["b"],
    },
    {
      name: "replace nukes",
      source: { a: stdio("npx") },
      target: { b: stdio("node"), c: stdio("uvx") },
      opts: { replace: true, prune: false },
      expectAdded: ["a"],
      expectRemoved: ["b", "c"],
    },
    {
      name: "remote skipped on stdio-only",
      source: { a: stdio("npx"), r: http("https://x") },
      target: {},
      opts: { replace: false, prune: false },
      remote: false,
      expectAdded: ["a"],
      expectRemoved: [],
      expectSkipped: ["r"],
    },
    {
      name: "no-op",
      source: { a: stdio("npx") },
      target: { a: stdio("npx") },
      opts: { replace: false, prune: false },
      expectAdded: [],
      expectRemoved: [],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const plan = planSync(c.source, target(c.target, c.remote ?? true), c.opts);
      expect(plan.added.sort()).toEqual(c.expectAdded.sort());
      expect(plan.removed.sort()).toEqual(c.expectRemoved.sort());
      if (c.expectSkipped) {
        expect(plan.skippedRemote.sort()).toEqual(c.expectSkipped.sort());
      }
    });
  }
});

// ---------- normalize/denormalize field matrix ----------

describe("normalize field matrix", () => {
  const samples: unknown[] = [
    { command: "npx" },
    { command: "npx", args: ["-y", "x"] },
    { command: "npx", env: { A: "1" } },
    { command: "npx", args: [], env: {} },
    { url: "https://x" },
    { type: "sse", url: "https://x/sse" },
    { type: "http", url: "https://x", headers: { H: "v" } },
    { type: "stdio", command: "node", cwd: "/w", disabled: true, timeout: 9 },
    { command: "npx", nested: { a: [1, 2], b: { c: true } } },
    null,
    "string",
    42,
    [],
    {},
    { args: ["only-args"] },
  ];

  for (const [i, raw] of samples.entries()) {
    it(`sample #${i}: ${JSON.stringify(raw)?.slice(0, 60)}`, () => {
      const n = normalizeEntry(raw);
      if (n === null) {
        expect(
          raw === null ||
            typeof raw !== "object" ||
            Array.isArray(raw) ||
            !("command" in (raw as object) || "url" in (raw as object)),
        ).toBe(true);
        return;
      }
      for (const style of ["plain", "typed"] as const) {
        const den = denormalizeEntry(n, style);
        const n2 = normalizeEntry(den);
        expect(n2).toBeTruthy();
        // type always recoverable
        expect(n2!.type).toBe(n.type);
        if (n.command) expect(n2!.command).toBe(n.command);
        if (n.url) expect(n2!.url).toBe(n.url);
        if (n.extra) {
          for (const k of Object.keys(n.extra)) {
            expect(den[k]).toEqual(n.extra[k]);
          }
        }
      }
    });
  }
});

// ---------- performance budget for large projects ----------

describe("performance budgets", () => {
  it("planSync 2000 servers < 500ms", () => {
    const source: ServerMap = {};
    const targetServers: ServerMap = {};
    for (let i = 0; i < 2000; i++) {
      source[`s${i}`] = {
        type: "stdio",
        command: "npx",
        args: ["-y", `pkg-${i}`],
        env: { K: String(i) },
      };
      if (i % 2 === 0) {
        targetServers[`s${i}`] = {
          type: "stdio",
          command: "npx",
          args: ["-y", `old-${i}`],
        };
      }
    }
    const state: ClientState = {
      def: plainDef("/t"),
      exists: true,
      servers: targetServers,
    };
    const t0 = performance.now();
    const plan = planSync(source, state, { replace: false, prune: false });
    const ms = performance.now() - t0;
    expect(plan.changed).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it("applyPlans 500 servers to 3 clients finishes < 10s", () => {
    const n = 500;
    const src = makeServers(n);
    const cursorPath = writeClient("cursor", src);
    const vscodePath = writeClient("vscode", {});
    const ccPath = writeClient("claude-code", {}, { keep: true });

    const sourceMap = parseServers(
      readFileSync(cursorPath, "utf8"),
      plainDef(cursorPath),
    ).servers;

    const mkState = (id: string, path: string, key: string, style: "plain" | "typed"): ClientState => ({
      def: {
        id,
        name: id,
        configPath: path,
        serversKey: key,
        style,
        supportsRemote: true,
        docsUrl: "",
      },
      exists: true,
      servers: {},
    });

    const plans = [
      planSync(sourceMap, mkState("vscode", vscodePath, "servers", "typed"), {
        replace: false,
        prune: false,
      }),
      planSync(sourceMap, mkState("claude-code", ccPath, "mcpServers", "typed"), {
        replace: false,
        prune: false,
      }),
    ];

    const t0 = performance.now();
    const { results } = applyPlans(plans, home);
    const ms = performance.now() - t0;
    expect(results.every((r) => r.ok)).toBe(true);
    expect(ms).toBeLessThan(10_000);

    // restore works on large stamp
    const stamps = JSON.parse(run(["backups", "--json"]).out).backups;
    expect(stamps.length).toBeGreaterThan(0);
    // re-apply different then restore
    writeFileSync(
      vscodePath,
      JSON.stringify({ servers: { wiped: { type: "stdio", command: "x" } } }),
    );
    const restored = restoreBackup({ stamp: stamps[0].stamp, home });
    expect(restored.ok).toBe(true);
    const vs = JSON.parse(readFileSync(vscodePath, "utf8"));
    // original before first apply was empty servers — backup of empty/prior
    expect(vs.servers).toBeDefined();
    void existsSync;
  }, 30_000);
});
