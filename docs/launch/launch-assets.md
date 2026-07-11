# mcp-sync — ready-to-paste launch posts

Copy, lightly personalize, and post per the schedule in [LAUNCH-PLAYBOOK.md](LAUNCH-PLAYBOOK.md).
**Precondition for all of these: npm publish first** — every post tells people to run `npx mcp-config-sync`.

---

## Day 1 — r/ClaudeAI

**Title:** I got tired of re-adding my MCP servers to every tool, so I built a one-command sync (open source)

**Body:**

Every time I set up an MCP server I end up doing it four times: Claude Desktop, Claude Code, Cursor, VS Code. And then they drift — one gets an updated arg, another is missing an API key, a third never got the new server at all.

So I built **mcp-sync**. One command shows the drift, one command fixes it:

```
npx mcp-config-sync status
npx mcp-config-sync sync --from claude-code
```

[demo GIF here — demo/demo.gif from the repo]

Design decisions that mattered to me:

- **Zero runtime dependencies** — nothing in your supply chain but Node built-ins, so `npx` cold-start is fast and there's nothing to audit
- **Safe by default** — every modified file is backed up first, `--dry-run` previews everything, and sync *merges* (it never deletes servers unless you explicitly pass `--prune` or `--replace`)
- **Only touches the MCP section** — everything else in `~/.claude.json` stays byte-for-byte intact

Supports Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, and Copilot CLI so far.

Repo: https://github.com/bhaskarpandey2708/mcp-sync

It's MIT-licensed and I'd genuinely love feedback — especially **which client you'd want added next** (Codex CLI's TOML config is top of my list).

---

## Day 2–3 — r/mcp

**Title:** mcp-sync: keep your MCP server configs identical across Claude, Cursor, VS Code and 4 more clients

**Body:**

Config portability keeps coming up as an MCP pain point — every client has its own file, its own key (`mcpServers` vs `servers`), its own dialect (plain vs typed), and its own opinion on remote servers.

I shipped a small zero-dependency CLI that normalizes all of that:

```
npx mcp-config-sync status     # who has what, what's drifted
npx mcp-config-sync diff       # exactly which fields differ
npx mcp-config-sync sync --from cursor
```

It knows each client's dialect, translates remote (http/sse) entries where the target supports them and skips them with a warning where it doesn't, backs up every file before writing, and never touches keys outside the servers section.

Repo: https://github.com/bhaskarpandey2708/mcp-sync — client adapters are single data entries, so PRs for new clients are very easy (several `good first issue`s open).

---

## Day 2–3 — r/cursor

**Title:** Sync your Cursor MCP servers to Claude, VS Code and everywhere else in one command

**Body:**

If Cursor is where you actually maintain your MCP setup, this makes it the source of truth for every other tool:

```
npx mcp-config-sync sync --from cursor --dry-run   # preview
npx mcp-config-sync sync --from cursor             # apply (with automatic backups)
```

Zero dependencies, merge-by-default (never deletes without `--prune`), backs up every file it touches. MIT. https://github.com/bhaskarpandey2708/mcp-sync

---

## Day 4–5 — Show HN

**Title:** Show HN: Mcp-sync – keep MCP configs in sync across Claude, Cursor, VS Code

**URL:** https://github.com/bhaskarpandey2708/mcp-sync

**First comment (post immediately after submitting):**

Author here. I built this because I kept setting up the same MCP servers in four different tools, and they kept drifting apart.

The interesting constraints:

1. **Zero runtime dependencies.** It's a config translator — it shouldn't need a supply chain. Node built-ins only, which also keeps `npx` cold-start fast.

2. **Each client is data, not code.** Claude Desktop, Cursor et al. differ only in config path, which key holds the servers, whether entries are typed, and whether remote servers work. So an adapter is one registry entry, and most "add client X" PRs are a few lines plus a test.

3. **Safety over cleverness.** Shared config files like `~/.claude.json` hold a lot of unrelated state, so writes preserve every key outside the servers section. Every touched file is backed up to a timestamped folder first. Sync merges by default — deletion only happens behind explicit `--prune`/`--replace` flags.

Next up is OpenAI Codex CLI support, which is the first non-JSON client (TOML) and needs a minimal scoped TOML layer to stay zero-dep.

Happy to answer anything about the MCP config mess — it's deeper than I expected.

---

## Week 2 — X/Twitter thread

1/ Every MCP user I know has this problem: you add a server to Claude Desktop, then re-add it to Cursor, then Claude Code, then VS Code. A month later they've all drifted.

2/ I built mcp-sync to fix it. One command to see the drift, one to fix it: `npx mcp-config-sync status` → `npx mcp-config-sync sync --from cursor` [attach demo GIF]

3/ It's zero-dependency (Node built-ins only), backs up every file before writing, merges by default, and never touches anything outside the MCP section of your configs.

4/ 7 clients supported: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Copilot CLI. Codex CLI (TOML) is next. MIT licensed, PRs welcome — adapters are single data entries: https://github.com/bhaskarpandey2708/mcp-sync #MCP #ClaudeCode

---

## Week 2 — dev.to writeup outline

**Title:** How I built a zero-dependency CLI for the MCP config mess

- The problem: N clients × M servers × drift; real examples of the four dialects (plain `mcpServers`, typed `servers`, shared state files, TOML on the horizon)
- Design decision 1: zero deps as a feature (supply chain, npx cold start)
- Design decision 2: clients as data — show the actual `ClientDef` registry entry for Cursor
- Design decision 3: safety defaults — backups, merge-not-replace, dry-run, surgical writes
- The Windows path bug CI caught on day one (path.join vs hardcoded separators) — why the 3-OS matrix earns its keep
- What's next: Codex TOML adapter, interactive mode
- Close: try `npx mcp-config-sync status`, contribute an adapter

---

## Directory submissions checklist

- [ ] mcpservers.org
- [ ] PulseMCP
- [ ] mcp.so
- [ ] PR into `awesome-mcp-servers`
- [ ] PR into `awesome-claude-code`
