# mcp-sync — project context

Zero-dependency TypeScript CLI that syncs MCP server configs across AI clients (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Copilot CLI). v0.1.0 is live at https://github.com/bhaskarpandey2708/mcp-sync (published 2026-07-08); npm publish still pending (requires `npm login`).

## Purpose

This project is the owner's path into Anthropic's Claude for OSS program (apply ~Sept/Oct 2026 via the "maintain something the ecosystem quietly depends on" track). Strategy docs live one directory up: `../claude-for-oss-roadmap.md` and `../LAUNCH-PLAYBOOK.md`. Growth must be legitimate — never suggest fake stars or download inflation.

## Architecture

- `src/types.ts` — canonical `McpServer` model (`stdio` | `http` | `sse`) and interfaces
- `src/clients.ts` — client registry (`getClients()`) + format adapters. Each client is data, not code: config path, servers key (`mcpServers`/`servers`), style (`plain`/`typed`), `supportsRemote`
- `src/core.ts` — pure logic: `planSync` (merge/replace/prune), `diffAll`, backups, `applyPlan`
- `src/cli.ts` — arg parsing (`node:util` parseArgs), command handlers, ANSI output
- `tests/` — vitest; 27 tests

## Hard rules

- **Zero runtime dependencies.** Node built-ins only. Dev deps are fine.
- **Never touch keys outside the servers section** of user config files (`~/.claude.json` and `~/.gemini/settings.json` hold unrelated state — `renderDoc` preserves it).
- **Every file write goes through backup** (`~/.mcp-sync/backups/<timestamp>/`).
- Merge is the default sync mode; deletion only via explicit `--prune`/`--replace`.

## Commands

```bash
npm install && npm run build && npm test   # build + 27 tests must pass
node dist/cli.js status                    # manual smoke test
```

CI (`.github/workflows/ci.yml`): Linux/macOS/Windows × Node 20/22/24. Node 18 is unsupported (EOL; vitest 4 requires Node 20.19+), `engines.node` is `>=20`.

## Publish status (2026-07-08)

Done: username placeholders filled (bhaskarpandey2708), git repo pushed to GitHub with topics, 4 good-first-issues open (#1 Codex TOML, #2 Zed, #3 Cline, #4 interactive mode), CI green on Linux/macOS/Windows, vitest upgraded to v4 (0 audit findings). Remaining (owner-only): `npm login && npm publish`, then verify `npx mcp-sync@latest status` cold.

## Roadmap (in priority order)

1. Codex CLI adapter — TOML config (`~/.codex/config.toml`, `[mcp_servers.<id>]` tables). Needs a minimal TOML read/write layer scoped to that section; keep zero-dep. This is v0.2's headline feature.
2. Zed adapter (`context_servers` in settings.json), Cline adapter (VS Code globalStorage path).
3. Interactive mode (no flags → prompt for source/targets).
4. `restore` command for backups.

Known competitors (both weak): ztripez/mcp-sync (Python, stale, 45★), william-garden/sync-mcp (pairwise only, 48★). Differentiators to protect: npx cold-start speed, all-clients-at-once sync, zero deps, safety defaults.
