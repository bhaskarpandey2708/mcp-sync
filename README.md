# mcp-sync

[![CI](https://github.com/bhaskarpandey2708/mcp-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/bhaskarpandey2708/mcp-sync/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-config-sync)](https://www.npmjs.com/package/mcp-config-sync)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**One command to keep your MCP servers in sync across every AI tool you use.**

![mcp-sync demo: status shows drift, sync --from cursor fixes it with backups](demo/demo.gif)

You added your MCP servers to Claude Desktop. Then you set them up again in Cursor. Then again in Claude Code, VS Code, Windsurf... and now they've all drifted apart — different versions, different flags, one missing an API key.

`mcp-sync` fixes that:

```bash
npx mcp-config-sync status          # see every client and what's out of sync
npx mcp-config-sync sync --from cursor   # make everything match Cursor
```

```
MCP clients
  ● Claude Desktop       3 servers
  ● Claude Code          2 servers
  ● Cursor               4 servers
  ● VS Code              1 server
  ○ Windsurf             not detected

  ⚠ 3 of 4 servers out of sync: exa, github, filesystem
  Run `mcp-sync diff` for details, `mcp-sync sync --from <client>` to fix.
```

## Why mcp-sync

- **Zero dependencies.** Nothing in your supply chain but Node built-ins. Fast `npx` cold start.
- **Safe by default.** Atomic writes, exclusive lock, automatic backups with restore, and merge-only unless you pass `--prune`/`--replace` **with** `--yes`. `--dry-run` previews everything.
- **Preserves your files.** Only the MCP server section is touched. Unknown server fields (`cwd`, `disabled`, …) round-trip. Everything else in `~/.claude.json` or `~/.gemini/settings.json` stays intact.
- **Automation-ready.** `--json` output and stable exit codes for CI. `validate` for config health.
- **Understands each client's dialect.** Plain `mcpServers` for Cursor/Claude Desktop, typed `servers` for VS Code. Remote (HTTP/SSE) servers are skipped for clients that can't run them, with a clear warning.

## Supported clients

| Client | Config file |
|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (per-OS) |
| Claude Code | `~/.claude.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code | `~/Library/Application Support/Code/User/mcp.json` (per-OS) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` |

Coming soon (PRs welcome — these are [good first issues](../../issues)): OpenAI Codex CLI (TOML), Zed, Cline, JetBrains.

## Install

No install needed:

```bash
npx mcp-config-sync status
```

Or globally:

```bash
npm i -g mcp-config-sync
```

Requires Node 20+.

## Commands

```
mcp-sync status                    Show detected clients and sync state (default)
mcp-sync list                      List every MCP server across all clients
mcp-sync diff                      Show exactly which servers differ and how
mcp-sync sync --from <client>      Copy servers from one client to all others
mcp-sync validate                  Check configs for errors and warnings
mcp-sync backups                   List timestamped backups
mcp-sync restore --stamp <id>      Restore configs from a backup
mcp-sync clients                   List supported clients and their config paths
```

### Sync options

```
--from <client>      Source of truth (required)
--to <a,b,...>       Only sync to these clients (default: all detected)
--dry-run            Preview changes without writing anything
--replace            Make targets exactly match the source (requires --yes)
--prune              Also delete target servers missing from the source (requires --yes)
--yes, -y            Confirm destructive --replace / --prune
```

### Global options

```
--json               Machine-readable JSON (for scripts and CI)
```

### Examples

```bash
# Preview what syncing from Claude Desktop would change
npx mcp-config-sync sync --from claude-desktop --dry-run

# Push your Cursor setup to VS Code and Claude Code only
npx mcp-config-sync sync --from cursor --to vscode,claude-code

# Nuke-and-pave: make every client exactly match Claude Code
npx mcp-config-sync sync --from claude-code --replace --yes

# Health check + CI-friendly drift signal
npx mcp-config-sync validate
npx mcp-config-sync status --json   # exit 1 if out of sync

# Undo the last sync
npx mcp-config-sync backups
npx mcp-config-sync restore --latest --dry-run
npx mcp-config-sync restore --latest
```

## How sync works

1. Reads the source client's MCP servers and normalizes them to a canonical form (unknown fields like `cwd` / `disabled` are preserved).
2. For each target: **merge** — source servers win on name collisions, extra target servers are kept (unless `--prune`/`--replace`).
3. Acquires an exclusive lock, backs up each target to `~/.mcp-sync/backups/<timestamp>/`, writes a `manifest.json`.
4. **Atomically** writes back in the target's native dialect (temp file + rename), preserving every unrelated key in the file.

### Safety guarantees

- **Atomic writes** — no half-written JSON if the process dies mid-sync
- **Locking** — concurrent `mcp-sync` runs cannot interleave
- **Backups + restore** — every write is reversible via `mcp-sync restore`
- **Lossless fields** — client-specific keys survive round-trips
- **Merge by default** — deletion requires explicit flags *and* `--yes`

## Contributing

Issues and PRs are very welcome — especially new client adapters (see [CONTRIBUTING.md](CONTRIBUTING.md)). Adding a client is usually a single entry in `src/clients.ts` plus a test.

## License

[MIT](LICENSE)
