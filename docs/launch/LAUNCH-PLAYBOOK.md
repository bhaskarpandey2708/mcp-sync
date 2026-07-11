# mcp-sync Launch Playbook

The code is done and tested (27 passing tests, verified end-to-end). These are the steps only you can do. Budget: ~2 hours for launch day, then ~30 min/day for issue triage.

## Step 1 — Publish to GitHub (15 min) ✅ DONE 2026-07-08

Live at https://github.com/bhaskarpandey2708/mcp-sync — topics set, description set, CI green on Linux/macOS/Windows × Node 20/22/24, and 4 `good first issue` tickets open (#1 Codex TOML, #2 Zed, #3 Cline, #4 interactive mode).

## Step 2 — Publish to npm (10 min)

```bash
npm login          # create account at npmjs.com if needed
cd mcp-sync
npm publish        # runs build + tests automatically first
npx mcp-config-sync@latest status   # verify it works cold
```

Do this soon — the name `mcp-sync` was unclaimed on 2026-07-08, and names get taken.

## Step 3 — Record a demo (20 min) ✅ DONE 2026-07-08

Recorded with vhs against a fixture home directory: `status` (drift) → `sync --from cursor --dry-run` → `sync` (shows backups) → `status` (all green). Lives at `mcp-sync/demo/demo.gif`, embedded at the top of the README; re-record any time with `vhs demo/demo.tape` from the repo root.

## Step 4 — Launch (launch day + trickle)

Don't post everywhere at once — spread over 2 weeks so each community sees it fresh.

**Day 1: Reddit r/ClaudeAI** (title): "I got tired of re-adding my MCP servers to every tool, so I built a one-command sync (open source)". Body: the pain, the GIF, `npx mcp-config-sync status`, ask for feedback + which clients to add next.

**Day 2–3: r/mcp and r/cursor** — same story, angle to each community.

**Day 4–5: Show HN**: "Show HN: Mcp-sync – keep MCP configs in sync across Claude, Cursor, VS Code". First comment: why you built it, the safety design (backups, dry-run, zero deps), what's next.

**Week 2: X/Twitter thread + dev.to writeup** ("How I built a zero-dependency CLI for the MCP config mess"). Tag it #MCP #ClaudeCode.

**Ongoing:** submit to mcpservers.org, PulseMCP, mcp.so, and PR yourself into awesome-mcp lists (`awesome-mcp-servers`, `awesome-claude-code`). Answer every "how do I move my MCP config" question you find on Reddit/Discord with a helpful answer that mentions the tool.

## Step 5 — Maintain like a maintainer (30 min/day)

- Reply to every issue within 24h, even just "looking into it".
- Ship a release every 1–2 weeks (new client adapters are easy wins — Codex TOML first, it's a visible differentiator).
- Thank and merge external PRs fast; first-time contributors who get merged come back.
- Keep CHANGELOG.md updated; tag releases on GitHub.

## Step 6 — Apply (Week 8–12)

Apply at https://claude.com/contact-sales/claude-for-oss once you have real numbers. Use the narrative template in `claude-for-oss-roadmap.md`, filled with actual metrics: stars, weekly npm downloads, issues closed, contributors, release count. The pitch writes itself: *"I maintain tooling that MCP users depend on to keep Claude working across their tools."*

## What NOT to do

- No fake stars, bots, or download inflation — detectable and disqualifying.
- Don't argue with critical commenters; fix or explain, then move on.
- Don't let the repo go quiet — "commits/releases within the last 3 months" is an explicit program criterion.
