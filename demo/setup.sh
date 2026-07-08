#!/bin/sh
# Builds a throwaway $HOME with realistically drifted MCP configs for the demo
# recording, plus a `mcp-sync` wrapper on PATH. Prints the fixture home path.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
H="/tmp/home"
rm -rf "$H"
mkdir -p "$H"

mkdir -p "$H/.cursor" "$H/Library/Application Support/Claude" \
  "$H/Library/Application Support/Code/User" "$H/bin"

# Cursor — the source of truth: 4 servers, all current
cat > "$H/.cursor/mcp.json" <<'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_************" }
    },
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": { "EXA_API_KEY": "****" }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
EOF

# Claude Desktop — stale: github lost its token, exa never added
cat > "$H/Library/Application Support/Claude/claude_desktop_config.json" <<'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
EOF

# Claude Code — only 2 servers, plus unrelated state that must survive a sync
cat > "$H/.claude.json" <<'EOF'
{
  "numStartups": 42,
  "theme": "dark",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_************" }
    }
  }
}
EOF

# VS Code — just one server, typed dialect
cat > "$H/Library/Application Support/Code/User/mcp.json" <<'EOF'
{
  "servers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_************" }
    }
  }
}
EOF

cat > "$H/bin/mcp-sync" <<EOF
#!/bin/sh
exec node "$ROOT/dist/cli.js" "\$@"
EOF
chmod +x "$H/bin/mcp-sync"

echo "$H"
