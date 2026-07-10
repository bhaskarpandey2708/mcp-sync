import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  denormalizeEntry,
  getClients,
  normalizeEntry,
  parseServers,
  renderDoc,
} from "../src/clients.js";
import type { ClientDef } from "../src/types.js";

const plainDef: ClientDef = {
  id: "cursor",
  name: "Cursor",
  configPath: "/tmp/mcp.json",
  serversKey: "mcpServers",
  style: "plain",
  supportsRemote: true,
  docsUrl: "",
};
const typedDef: ClientDef = {
  ...plainDef,
  id: "vscode",
  serversKey: "servers",
  style: "typed",
};

describe("normalizeEntry", () => {
  it("reads a plain stdio entry", () => {
    expect(
      normalizeEntry({ command: "npx", args: ["-y", "pkg"], env: { KEY: "v" } }),
    ).toEqual({ type: "stdio", command: "npx", args: ["-y", "pkg"], env: { KEY: "v" } });
  });

  it("infers http for url entries without a type", () => {
    expect(normalizeEntry({ url: "https://x.dev/mcp" })).toEqual({
      type: "http",
      url: "https://x.dev/mcp",
    });
  });

  it("respects an explicit type", () => {
    expect(normalizeEntry({ type: "sse", url: "https://x.dev/sse" })?.type).toBe("sse");
  });

  it("preserves unknown fields in extra", () => {
    const n = normalizeEntry({
      command: "npx",
      cwd: "/work",
      disabled: true,
      timeout: 30,
    });
    expect(n?.extra).toEqual({ cwd: "/work", disabled: true, timeout: 30 });
  });

  it("rejects garbage", () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry("nope")).toBeNull();
    expect(normalizeEntry({})).toBeNull();
    expect(normalizeEntry([1, 2])).toBeNull();
  });
});

describe("denormalizeEntry", () => {
  it("omits type for plain style stdio/http", () => {
    const out = denormalizeEntry({ type: "stdio", command: "npx", args: ["a"] }, "plain");
    expect(out).toEqual({ command: "npx", args: ["a"] });
    expect(denormalizeEntry({ type: "http", url: "https://x" }, "plain")).toEqual({
      url: "https://x",
    });
  });

  it("keeps sse type on plain style so round-trips do not become http", () => {
    const out = denormalizeEntry({ type: "sse", url: "https://x/sse" }, "plain");
    expect(out).toEqual({ type: "sse", url: "https://x/sse" });
    expect(normalizeEntry(out)?.type).toBe("sse");
  });

  it("includes type for typed style", () => {
    const out = denormalizeEntry({ type: "stdio", command: "npx" }, "typed");
    expect(out).toEqual({ type: "stdio", command: "npx" });
  });

  it("omits empty args/env", () => {
    const out = denormalizeEntry(
      { type: "stdio", command: "npx", args: [], env: {} },
      "plain",
    );
    expect(out).toEqual({ command: "npx" });
  });

  it("re-emits extra fields without overwriting known keys", () => {
    const out = denormalizeEntry(
      {
        type: "stdio",
        command: "npx",
        extra: { cwd: "/x", command: "evil", type: "http" },
      },
      "plain",
    );
    expect(out).toEqual({ command: "npx", cwd: "/x" });
  });
});

describe("parseServers / renderDoc round-trip", () => {
  it("reads mcpServers and servers keys", () => {
    const cursorDoc = JSON.stringify({
      mcpServers: { fs: { command: "npx", args: ["-y", "fs-server"] } },
    });
    expect(Object.keys(parseServers(cursorDoc, plainDef).servers)).toEqual(["fs"]);

    const vscodeDoc = JSON.stringify({
      servers: { fs: { type: "stdio", command: "npx" } },
      inputs: [],
    });
    expect(Object.keys(parseServers(vscodeDoc, typedDef).servers)).toEqual(["fs"]);
  });

  it("warns on invalid entries instead of throwing", () => {
    const doc = JSON.stringify({
      mcpServers: {
        good: { command: "npx" },
        bad: { noCommand: true },
      },
    });
    const { servers, warnings } = parseServers(doc, plainDef);
    expect(Object.keys(servers)).toEqual(["good"]);
    expect(warnings.some((w) => w.includes("bad"))).toBe(true);
  });

  it("preserves unrelated keys when rewriting (claude.json-style docs)", () => {
    const claudeJson = JSON.stringify({
      numStartups: 42,
      projects: { "/home/me/app": { history: ["stuff"] } },
      mcpServers: { old: { command: "node" } },
      theme: "dark",
    });
    const def: ClientDef = { ...plainDef, id: "claude-code", style: "typed" };
    const out = renderDoc(claudeJson, def, {
      github: { type: "stdio", command: "npx", args: ["-y", "gh"] },
    });
    const parsed = JSON.parse(out);
    expect(parsed.numStartups).toBe(42);
    expect(parsed.projects["/home/me/app"].history).toEqual(["stuff"]);
    expect(parsed.theme).toBe("dark");
    expect(Object.keys(parsed.mcpServers)).toEqual(["github"]);
    expect(parsed.mcpServers.github.type).toBe("stdio");
  });

  it("creates a fresh doc when the file doesn't exist", () => {
    const out = renderDoc(null, plainDef, { fs: { type: "stdio", command: "npx" } });
    expect(JSON.parse(out)).toEqual({ mcpServers: { fs: { command: "npx" } } });
  });

  it("survives a full round-trip without loss including extra fields", () => {
    const original = {
      mcpServers: {
        fs: {
          command: "npx",
          args: ["-y", "server-fs"],
          env: { ROOT: "/" },
          cwd: "/project",
          disabled: false,
        },
        api: { url: "https://api.example.com/mcp" },
      },
    };
    const { servers } = parseServers(JSON.stringify(original), plainDef);
    const out = JSON.parse(renderDoc(JSON.stringify(original), plainDef, servers));
    expect(out.mcpServers.fs).toEqual(original.mcpServers.fs);
    expect(out.mcpServers.api).toEqual(original.mcpServers.api);
  });
});

describe("getClients", () => {
  it("resolves paths under the provided home", () => {
    const clients = getClients("/fake/home", "/fake/data");
    const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
    expect(byId["claude-code"]!.configPath).toBe(join("/fake/home", ".claude.json"));
    expect(byId["claude-desktop"]!.configPath).toContain(join("/fake/data", "Claude"));
    expect(byId["cursor"]!.configPath).toBe(join("/fake/home", ".cursor", "mcp.json"));
    expect(clients.length).toBeGreaterThanOrEqual(7);
  });

  it("claude-desktop and windsurf are stdio-only", () => {
    const clients = getClients("/h", "/d");
    for (const id of ["claude-desktop", "windsurf"]) {
      expect(clients.find((c) => c.id === id)!.supportsRemote).toBe(false);
    }
  });
});
