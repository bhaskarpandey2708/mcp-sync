# Changelog

## 0.1.0 (2026-07-08)

Initial release.

- `status`, `list`, `diff`, `sync`, `clients` commands
- Clients: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, GitHub Copilot CLI
- Merge-by-default sync with `--replace`, `--prune`, `--to`, `--dry-run`
- Automatic timestamped backups to `~/.mcp-sync/backups/`
- Preserves all unrelated keys in shared config files (`~/.claude.json`, `~/.gemini/settings.json`)
- Remote (http/sse) servers translated where supported, skipped with a warning where not
- Zero runtime dependencies
