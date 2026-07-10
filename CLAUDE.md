# mcp-sync — project context

Zero-dependency TypeScript CLI that syncs MCP server configs across AI clients (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Copilot CLI).

- GitHub: https://github.com/bhaskarpandey2708/mcp-sync
- Strategy docs (parent dir): `../claude-for-oss-roadmap.md`, `../LAUNCH-PLAYBOOK.md`
- Hardening roadmap: `READINESS.md`
- Growth must be legitimate — never suggest fake stars or download inflation.

## Purpose

Owner path into Anthropic's Claude for OSS program (apply ~Sept/Oct 2026 via the "maintain something the ecosystem quietly depends on" track).

## Architecture

- `src/types.ts` — canonical `McpServer` (`stdio` | `http` | `sse`) + `extra` pass-through; plans, apply/validation types
- `src/clients.ts` — client registry (`getClients()`) + normalize/denormalize/parse/render
- `src/fsutil.ts` — atomic write, exclusive lock, backup stamp helpers
- `src/core.ts` — pure logic: `planSync`, `diffAll`, backups, `applyPlans`, `validateStates`, `restoreBackup`
- `src/cli.ts` — arg parsing, commands, ANSI / `--json` output
- `tests/` — vitest (unit + CLI integration)

## Hard rules

- **Zero runtime dependencies.** Node built-ins only. Dev deps are fine.
- **Never touch keys outside the servers section** of user config files.
- **Every file write:** acquire lock → backup → atomic write → manifest (for multi-apply).
- **Unknown server fields must round-trip** via `extra`.
- Merge is the default sync mode; deletion only via explicit `--prune`/`--replace` **and** `--yes`.
- `--dry-run` never writes.

## Commands

```bash
npm install && npm run build && npm test
node dist/cli.js status
node dist/cli.js validate
node dist/cli.js sync --from cursor --dry-run
node dist/cli.js backups
node dist/cli.js restore --latest --dry-run
```

CI (`.github/workflows/ci.yml`): Linux/macOS/Windows × Node 20/22/24. `engines.node` is `>=20`.

## Publish status

v0.2.0 is on npm as **`@bhaskarauthor/mcp-sync`** (unscoped `mcp-sync` blocked by npm similarity to `mcpsync`). Binary name stays `mcp-sync`. Cold check: `npx @bhaskarauthor/mcp-sync@latest status`.

## Roadmap (priority)

See `READINESS.md` for full gates. Short list:

1. Launch posts + directory submissions (ops)
2. Secret redaction in JSON/logs
3. Codex CLI TOML adapter (v0.2 product headline)
4. Project-local config scopes
5. Policy file + protected servers
6. `watch` mode (after lock/debounce proven)
7. Backup retention + journal undo
