# Changelog

## 0.2.0 (2026-07-10)

Hardening release — foundation for automation without data loss.

### Correctness
- **SSE round-trip fix:** plain-style denormalize now emits `type: "sse"` so sync no longer rewrites SSE servers as HTTP

### Safety & robustness
- **Lossless round-trip:** unknown server fields (`cwd`, `disabled`, `timeout`, …) preserved in `extra` and re-emitted on write
- **Atomic writes:** temp file + rename for every config mutation
- **Exclusive lock:** concurrent `sync`/`restore` blocked via `~/.mcp-sync/mcp-sync.lock` (stale PID reclaim)
- **Backup manifests:** each multi-file write stamp includes `manifest.json` for audit/restore
- **Destructive confirm:** `--replace` and `--prune` require `--yes` (or use `--dry-run` first)
- **Per-target apply results:** write failures no longer throw mid-loop; reported per client

### New commands
- `validate` — config health (errors/warnings/info)
- `backups` — list timestamped backups
- `restore --stamp <id> | --latest` — restore from backup (writes a pre-restore safety backup)

### Automation
- Global `--json` for machine-readable output
- Exit codes: `0` ok, `1` drift/validation errors, `2` usage/hard failure
- Warnings surfaced on `status` when entries are skipped

### Docs
- `READINESS.md` — issue map, layer gates, future feature readiness

## 0.1.0 (2026-07-08)

Initial release.

- `status`, `list`, `diff`, `sync`, `clients` commands
- Clients: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, GitHub Copilot CLI
- Merge-by-default sync with `--replace`, `--prune`, `--to`, `--dry-run`
- Automatic timestamped backups to `~/.mcp-sync/backups/`
- Preserves all unrelated keys in shared config files (`~/.claude.json`, `~/.gemini/settings.json`)
- Remote (http/sse) servers translated where supported, skipped with a warning where not
- Zero runtime dependencies
