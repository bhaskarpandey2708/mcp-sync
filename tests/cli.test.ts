import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * CLI integration tests run main() against a temporary HOME so we never
 * touch the developer's real MCP configs.
 */
import { main } from "../src/cli.js";

function withHome(fn: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "mcp-sync-cli-"));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // macOS app-data lives under ~/Library/Application Support when HOME is set
  try {
    fn(home);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
  }
}

function seedCursor(home: string, servers: Record<string, unknown>): void {
  const dir = join(home, ".cursor");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "mcp.json"),
    JSON.stringify({ mcpServers: servers }, null, 2) + "\n",
  );
}

function capture(fn: () => number): { code: number; out: string; err: string } {
  const logs: string[] = [];
  const errs: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errs.push(args.map(String).join(" "));
  };
  try {
    const code = fn();
    return { code, out: logs.join("\n"), err: errs.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe("cli main", () => {
  it("prints version", () => {
    const { code, out } = capture(() => main(["--version"]));
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("status --json reports clients", () => {
    withHome((home) => {
      seedCursor(home, { fs: { command: "npx", args: ["-y", "x"] } });
      const { code, out } = capture(() => main(["status", "--json"]));
      expect(code).toBe(0);
      const payload = JSON.parse(out);
      expect(payload.clients.some((c: { id: string }) => c.id === "cursor")).toBe(
        true,
      );
    });
  });

  it("sync --replace requires --yes", () => {
    withHome((home) => {
      seedCursor(home, { fs: { command: "npx" } });
      const { code, err } = capture(() =>
        main(["sync", "--from", "cursor", "--replace"]),
      );
      expect(code).toBe(2);
      expect(err + "").toMatch(/--yes/);
    });
  });

  it("validate --json succeeds on clean config", () => {
    withHome((home) => {
      seedCursor(home, { fs: { command: "npx", args: ["-y", "x"] } });
      const { code, out } = capture(() => main(["validate", "--json"]));
      const payload = JSON.parse(out);
      expect(payload.ok).toBe(true);
      expect(code).toBe(0);
    });
  });

  it("unknown command exits 2", () => {
    const { code } = capture(() => main(["nope"]));
    expect(code).toBe(2);
  });
});
