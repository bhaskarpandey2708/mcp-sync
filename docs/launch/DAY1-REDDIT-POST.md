# Day 1 launch — r/ClaudeAI (ready to paste)

**Do this yourself in the browser** (Reddit login required).  
Full pack for LinkedIn + X + Reddit: [SOCIAL-PUBLISH-PACK.md](SOCIAL-PUBLISH-PACK.md)

**Subreddit:** https://www.reddit.com/r/ClaudeAI/submit  
**Attach (video):** `mcp-sync/demo/demo-story-1080p.mp4` — 1920×1080, ~98s  
  Story: CTA → what MCP is → problem → live terminal → try it  

---

## Title

I got tired of re-adding my MCP servers to every tool, so I built a one-command sync (open source)

## Body

Every time I set up an MCP server I end up doing it four times: Claude Desktop, Claude Code, Cursor, VS Code. And then they drift — one gets an updated arg, another is missing an API key, a third never got the new server at all.

So I built **mcp-sync**. One command shows the drift, one command fixes it:

```
npx mcp-config-sync status
npx mcp-config-sync sync --from cursor
```

[attach demo video — mcp-sync/demo/demo-story-1080p.mp4]

Design decisions that mattered to me:

- **Zero runtime dependencies** — nothing in your supply chain but Node built-ins, so `npx` cold-start is fast and there's nothing to audit
- **Safe by default** — every modified file is backed up first, writes are atomic, `--dry-run` previews everything, and sync *merges* (it never deletes servers unless you explicitly pass `--prune`/`--replace` **and** `--yes`)
- **Only touches the MCP section** — everything else in `~/.claude.json` stays intact; unknown fields like `cwd` / `disabled` round-trip

Supports Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, and Copilot CLI so far.

```
npx mcp-config-sync validate   # health check
npx mcp-config-sync restore --latest   # undo a sync
```

Repo: https://github.com/bhaskarpandey2708/mcp-sync  
npm: https://www.npmjs.com/package/mcp-config-sync

It's MIT-licensed and I'd genuinely love feedback — especially **which client you'd want added next** (Codex CLI's TOML config is top of my list).

---

## After you post

1. Reply to every comment within 24h  
2. Same day: X + LinkedIn (copy in `SOCIAL-PUBLISH-PACK.md`)  
3. Day 2–3: r/mcp + r/cursor  
4. Day 4–5: Show HN  
