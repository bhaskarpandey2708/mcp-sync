# Contributing to mcp-sync

Thanks for helping! The most valuable contributions right now are **new client adapters** and **bug reports with your real config files** (redact your API keys).

## Dev setup

```bash
git clone https://github.com/bhaskarpandey2708/mcp-sync
cd mcp-sync
npm install
npm run build
npm test
```

## Adding a new client

Most JSON-based clients need only:

1. A new entry in `getClients()` in `src/clients.ts` — id, name, config path per platform, which key holds the servers (`mcpServers` or `servers`), whether entries carry a `type` field, and whether remote servers are supported.
2. A test in `tests/clients.test.ts` with a realistic config fixture.
3. A row in the README's supported-clients table.

Clients with non-JSON configs (e.g. Codex CLI's TOML) need a format adapter — open an issue first so we can agree on the approach.

## Guidelines

- Zero runtime dependencies is a core feature of this project. Dev dependencies are fine.
- Never touch keys outside the MCP servers section of a user's config file.
- Any code path that writes a file must go through the backup mechanism.
- `npm test` and `npm run build` must pass; CI runs on Linux/macOS/Windows × Node 20/22/24.

## Releasing (maintainers)

```bash
npm version patch|minor
git push --follow-tags
npm publish
```
