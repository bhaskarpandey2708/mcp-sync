# mcp-sync — Hardening & Readiness Roadmap

Last updated: 2026-07-10

This document is the engineering north star: what was broken or incomplete
**today**, what we just made solid, and what can land next without regressions
as we push toward full automation and production robustness.

---

## 1. Today's issues (pre-hardening audit)

| Area | Issue | Severity | Status |
|------|--------|----------|--------|
| **Data loss** | Unknown entry fields (`cwd`, `disabled`, `timeout`, …) were stripped on sync | Critical | **Fixed** — preserved in `extra` |
| **Corruption** | `writeFileSync` mid-crash could leave half-written JSON | Critical | **Fixed** — atomic write (temp + rename) |
| **Concurrency** | Two `sync` processes could interleave writes | High | **Fixed** — exclusive lock `~/.mcp-sync/mcp-sync.lock` |
| **Recovery** | Backups existed but no CLI restore path | High | **Fixed** — `backups` + `restore` |
| **Silent drops** | Invalid server entries discarded with no warning | High | **Fixed** — warnings on load + `validate` |
| **Destructive ops** | `--replace` / `--prune` had no confirmation (`--yes` unused) | High | **Fixed** — requires `--yes` |
| **Partial apply** | Multi-target apply could throw mid-loop | Medium | **Fixed** — per-target `ApplyResult`, shared stamp + manifest |
| **Automation** | No machine-readable output / stable exit codes for CI | Medium | **Fixed** — `--json` + exit codes |
| **Audit trail** | Backups had no manifest of what changed | Medium | **Fixed** — `manifest.json` per stamp |
| **Tests** | No CLI integration tests; no apply/lock/restore coverage | Medium | **Fixed** — expanded suite |
| **Publish** | npm package name | Done as `mcp-sync-cli` | Unscoped `mcp-sync` blocked (similarity to `mcpsync`) |
| **Formats** | JSON-only; Codex TOML / Zed / Cline missing | Product | Ready to land on solid base |
| **Scopes** | User-global configs only (no project `.cursor/mcp.json`) | Product | Planned |
| **Watch/auto** | No daemon / file-watch auto-sync | Product | Planned after lock+validate proven |

---

## 2. Foundation now in place (v0.2 readiness)

These are **load-bearing** for every future feature. Do not regress them.

1. **Lossless model** — canonical `McpServer` + `extra` pass-through  
2. **Atomic writes** — `atomicWriteFile` for every config mutation  
3. **Exclusive lock** — multi-file ops hold `mcp-sync.lock` (stale PID reclaim)  
4. **Timestamped backups + manifest** — restore is first-class  
5. **Validate surface** — configs can be health-checked before/after sync  
6. **`--json` + exit codes** — scriptable (`status`/`diff` exit 1 on drift; errors exit 2)  
7. **Destructive confirm** — `--replace`/`--prune` need `--yes`  
8. **Zero runtime deps** — still Node built-ins only  

### Commands (current)

```
status | list | diff | sync | validate | backups | restore | clients
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success / clean |
| 1 | Drift or validation errors (useful in CI) |
| 2 | Usage / hard failure / lock / write failure |

---

## 3. What can land next (layered readiness)

Each layer assumes the layer below is green. Ship in this order so nothing
breaks upward.

### Layer A — Product completeness (v0.2–0.3)

| Feature | Why | Readiness | Risk notes |
|---------|-----|-----------|------------|
| **Codex CLI (TOML)** | Headline differentiator; non-JSON | Ready for design | Scoped TOML R/W only under `[mcp_servers.*]`; never full TOML rewrite of unrelated keys |
| **Zed `context_servers`** | Good-first-issue #2 | Ready | Registry entry + fixture test |
| **Cline adapter** | Good-first-issue #3 | Ready | Path under VS Code `globalStorage` varies by OS |
| **Interactive mode** | Good-first-issue #4 | Ready | Use TTY detect; fall back to errors when non-interactive |
| **Project-local configs** | Real multi-repo workflows | Partial | Need scope flag: `--scope user\|project`; discovery of `.cursor/mcp.json`, `.vscode/mcp.json` |
| **VS Code Insiders / Cursor nightlies** | Same format, alt paths | Ready | Extra `ClientDef` rows |

**Gate before A ships:** `npm test` + matrix CI green; field-preservation tests stay green.

### Layer B — Automation & efficiency (v0.3–0.4)

| Feature | Why | Readiness | Risk notes |
|---------|-----|-----------|------------|
| **`watch` / daemon** | Auto-sync on config change | **Blocked until** lock + debounce proven | Debounce ≥300ms; ignore own writes; never watch without `--yes` policy for prune |
| **Git hooks / CI action** | `mcp-sync validate` / `diff` in pipelines | Ready now | Use `--json` + exit 1 |
| **Policy file** `~/.mcp-sync/config.json` | Default `--from`, ignore lists, protected servers | Ready | Schema-validate policy; never auto-delete protected names |
| **Server ignore / protect** | Don't clobber machine-specific servers | Ready | e.g. `protect: ["local-db"]` |
| **Profiles** | Work vs personal MCP sets | Ready | Named maps under `~/.mcp-sync/profiles/` |
| **Import/export** | Share a portable MCP pack | Ready | Export canonical JSON only; strip secrets option |

**Gate before B ships:** stress test concurrent `sync` + `watch`; restore drills documented.

### Layer C — Robustness at “nothing breaks” level (v0.4–1.0)

| Feature | Why | Readiness | Risk notes |
|---------|-----|-----------|------------|
| **Transaction journal** | Multi-client all-or-nothing | Design | Today: best-effort + full pre-write backups. Journal = ordered undo of stamp |
| **Checksum / etag** | Detect external edit during plan→apply | Ready | Compare mtime+size or content hash after lock |
| **Secret redaction in logs** | `--json` must not leak keys in shared CI logs | Ready | Redact `env` values in describe/json unless `--show-secrets` |
| **Schema versions** | Forward-compatible manifests | Ready | `manifest.version: 1` |
| **Backup retention** | Cap disk use (`--keep 20` / 30d) | Ready | Never delete last known-good without confirm |
| **Doctor deep checks** | Reachability of `command`, env var presence | Partial | Optional network; keep offline-default |
| **Fuzz / property tests** | Random configs never corrupt docs | Ready | Round-trip property: parse→render→parse |
| **Windows long paths / junctions** | Enterprise laptops | Partial | CI already on Windows; add junction fixtures |

**Gate before 1.0:** restore from stamp in &lt;30s; zero data-loss bugs for 30 days post-launch.

### Layer D — Ecosystem / Claude for OSS (parallel)

| Work | Status |
|------|--------|
| npm publish | Owner action |
| Launch posts (see `../launch-assets.md`) | After npm |
| Directory listings | After npm |
| `mcp-doctor` second product | After mcp-sync v0.3 traction |
| External contributors via good-first-issues | Open |

---

## 4. Non-negotiable invariants (regression guards)

Any PR that breaks these is rejected:

1. **Zero runtime dependencies**  
2. **Never mutate keys outside the servers section**  
3. **Every write: lock → backup → atomic write → manifest**  
4. **Merge default; delete only with explicit flags + `--yes`**  
5. **Unknown server fields survive round-trip**  
6. **`--dry-run` never touches disk** (except read)  
7. **CI: Linux × macOS × Windows, Node 20/22/24**  

---

## 5. Suggested near-term execution order

```
[done]  Hardening foundation (this pass)
[next]  npm publish + cold npx verify
[next]  Secret redaction in --json describe paths
[next]  Codex TOML adapter (v0.2 headline)
[next]  Project-local scope discovery
[next]  Policy file + protected servers
[next]  watch mode (debounced, locked)
[next]  Retention + journal undo
[later] mcp-doctor spin-out
```

---

## 6. How to verify this tree

```bash
cd mcp-sync
npm install
npm run build
npm test
node dist/cli.js status
node dist/cli.js validate
node dist/cli.js sync --from cursor --dry-run
```

For automation:

```bash
node dist/cli.js status --json
node dist/cli.js validate --json
# exit 1 ⇒ drift/errors — wire into CI
```
