# Publish pack — LinkedIn · Reddit · X

**Video to attach everywhere:**  
`/Users/bhaskar_pandey/Documents/claude/mcp-sync/demo/demo-story-1080p.mp4`  
(1920×1080 · ~98s · typewriter + soft BGM · terminal readable)

**Links (in every post):**  
- GitHub: https://github.com/bhaskarpandey2708/mcp-sync  
- npm: https://www.npmjs.com/package/mcp-config-sync  
- Try: `npx mcp-config-sync status`

**Order that works best today:** Reddit first (video-friendly) → X → LinkedIn  
(or LinkedIn last if you want a more polished cut of the same story).

---

## 1) Reddit — r/ClaudeAI (Day 1)

**Submit:** https://www.reddit.com/r/ClaudeAI/submit  
**Type:** Image & Video → upload the MP4  
**Flair:** Tools / Projects if available

### Title
```
I got tired of re-adding my MCP servers to every tool, so I built a one-command sync (open source)
```

### Body
```
Every time I set up an MCP server I end up doing it four times: Claude Desktop, Claude Code, Cursor, VS Code. And then they drift — one gets an updated arg, another is missing an API key, a third never got the new server at all.

So I built **mcp-sync**. One command shows the drift, one command fixes it:

```
npx mcp-config-sync status
npx mcp-config-sync sync --from cursor
```

[video attached — ~90s story: CTA → what MCP is → problem → live fix]

Design decisions that mattered to me:

- **Zero runtime dependencies** — nothing in your supply chain but Node built-ins
- **Safe by default** — backups first, atomic writes, `--dry-run` previews everything; merge-only unless you pass `--prune`/`--replace` **with** `--yes`
- **Only touches the MCP section** — everything else in `~/.claude.json` stays intact

Supports Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, and Copilot CLI.

```
npx mcp-config-sync validate
npx mcp-config-sync restore --latest
```

Repo: https://github.com/bhaskarpandey2708/mcp-sync  
npm: https://www.npmjs.com/package/mcp-config-sync

MIT — feedback welcome, especially **which client you want next** (Codex CLI TOML is #1 on my list).
```

### Also post (same day or +1)
| Sub | Title angle |
|-----|-------------|
| https://www.reddit.com/r/mcp/submit | mcp-sync: keep MCP configs identical across Claude, Cursor, VS Code… |
| https://www.reddit.com/r/cursor/submit | Sync your Cursor MCP servers to Claude / VS Code in one command |
| https://www.reddit.com/r/LocalLLaMA/submit only if it fits | skip if too off-topic |

---

## 2) X / Twitter

**Compose:** https://x.com/compose/post  
**Attach:** the same 1080p MP4 (native video performs better than a link)

### Single post (best for reach)
```
Your AI apps don't share tools.

Claude · Cursor · Copilot · VS Code — each keeps its own MCP list. They drift. You re-add the same server 4 times.

I built mcp-sync: one command to see the mess, one command to fix it.

npx mcp-config-sync status
npx mcp-config-sync sync --from cursor

Free · open source · backups + dry-run

github.com/bhaskarpandey2708/mcp-sync
```

### Optional short thread (if you prefer)

**1/4**
```
Hot take: the real MCP pain isn't servers — it's that every AI app keeps its own copy of them.

Claude Desktop ≠ Cursor ≠ VS Code ≠ Claude Code.

They drift. Quietly.
```

**2/4**
```
So I shipped mcp-sync.

• status → see what's out of sync
• sync --dry-run → preview
• sync --from cursor → make everyone match

Zero deps. Auto backups. Undo anytime.
```

**3/4**
```
Works with:
Claude Desktop · Claude Code · Cursor · VS Code · Windsurf · Gemini CLI · Copilot CLI

npx mcp-config-sync status
```

**4/4**
```
Video walkthrough + repo ↓
github.com/bhaskarpandey2708/mcp-sync

What client should I add next? Codex TOML is first on the list.
```

**Hashtags (use sparingly, end of post):** `#MCP #ClaudeAI #Cursor #OpenSource #devtools`

---

## 3) LinkedIn

**Compose:** https://www.linkedin.com/feed/  
Click **Start a post** → add video → paste text

### Post body
```
I kept re-adding the same MCP servers to Claude, Cursor, Copilot, and VS Code.

A week later nothing matched — different keys, missing tools, nobody knew which app was “truth.”

So I built mcp-sync (open source).

What it does:
→ Shows which AI apps are out of sync
→ Previews the fix with --dry-run (nothing written)
→ Syncs from one source of truth (e.g. Cursor) with automatic backups

One command to try it (no install):

npx mcp-config-sync status

Design principles:
• Zero runtime dependencies
• Safe by default (backups, atomic writes, merge-only)
• Only touches the MCP section of your configs

Repo: https://github.com/bhaskarpandey2708/mcp-sync  
npm: https://www.npmjs.com/package/mcp-config-sync

If you use more than one AI coding tool, this will feel familiar. Happy to take feedback — and PRs for new clients (Codex CLI is next).

#OpenSource #MCP #ClaudeAI #Cursor #DeveloperTools #BuildInPublic
```

**Tip:** First line is the hook on LinkedIn — keep it personal. Upload the video natively (don’t only link GitHub).

---

## Checklist before you hit Post

- [ ] Video file ready: `mcp-sync/demo/demo-story-1080p.mp4`
- [ ] Sound on when you preview once
- [ ] npm works cold: `npx mcp-config-sync@latest --help`
- [ ] GitHub README shows the latest preview GIF
- [ ] You’re logged into Reddit / X / LinkedIn in the browser
- [ ] After Reddit: stay online 1–2h and reply to every comment

---

## What I can’t do from this CLI

Posting to Reddit, LinkedIn, and X requires **your** logged-in browser session.  
This pack is copy-paste ready. Video path and compose URLs are listed above.

After you post, drop the three URLs here and we can track engagement / draft follow-ups.
