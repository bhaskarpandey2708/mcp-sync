# Product cycle — mcp-sync

| Field | Value |
|-------|--------|
| **Track** | Beta (`ship-beta`) |
| **Version** | `0.2.0` |
| **Cycle** | **CLOSED** (Beta) |
| **Closed at** | 2026-07-12T04:12:35.713Z |
| **Publish** | **Not published** — local workspace only until explicit go-ahead |

## Closed-cycle checklist

- [x] `package.json` name + version set
- [x] MIT LICENSE
- [x] README documents scope + limitations
- [x] Automated tests exist and pass under suite litmus
- [x] Cycle smoke tests (`tests/cycle.test.mjs`) for core entrypoints
- [x] Demo or usage path documented
- [x] Zero runtime dependencies (suite convention)
- [x] Known limitations listed (below)
- [ ] npm publish (blocked until owner says go)
- [ ] git remote push (blocked until owner says go)

## Known limitations (Beta)

- Full CLI product; continue hardening edge cases and adapters.
- Do not assume multi-OS CI matrix is complete for every package.

## How to verify

```bash
cd mcp-sync
npm test
npm run cycle:check 2>/dev/null || node --test tests/*.test.mjs tests/**/*.test.mjs
```

Suite: `node scripts/suite-litmus.mjs` from workspace root.
