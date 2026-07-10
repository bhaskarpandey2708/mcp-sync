# 1080p launch demo — from repo root:
#   vhs demo/demo-1080p.tape
#
# Primary output: demo/demo-1080p.mp4 (1920×1080)

Output demo/demo-1080p.mp4

Set Shell "bash"
Set FontSize 24
Set FontFamily "Menlo"
Set Width 1920
Set Height 1080
Set Padding 28
Set Margin 16
Set MarginFill "#11111b"
Set Framerate 30
Set TypingSpeed 35ms
Set Theme "Catppuccin Mocha"
Set WindowBar "Colorful"
Set WindowBarSize 36
Set BorderRadius 10

Hide
Type `export HOME="$(sh demo/setup.sh)" && export PATH="$HOME/bin:$PATH" && clear`
Enter
Sleep 2s
Show

# 1 — drift
Type "mcp-sync status"
Enter
Sleep 5s

# 2 — safe preview
Type "clear"
Enter
Sleep 400ms
Type "mcp-sync sync --from cursor --dry-run"
Enter
Sleep 5s

# 3 — apply + backups
Type "clear"
Enter
Sleep 400ms
Type "mcp-sync sync --from cursor"
Enter
Sleep 5s

# 4 — all green
Type "clear"
Enter
Sleep 400ms
Type "mcp-sync status"
Enter
Sleep 4s

# 5 — validate
Type "mcp-sync validate"
Enter
Sleep 4s

Sleep 2s
