# Big, readable 1080p launch demo — from repo root:
#   vhs demo/demo-1080p.tape
#
# Design goals:
#   - Font large enough to read on mobile after Reddit re-encode
#   - Minimal empty chrome — content fills the frame
#   - One command per screen (clear between steps)

Output demo/demo-1080p.mp4

Set Shell "bash"
Set FontSize 42
Set FontFamily "Menlo"
Set Width 1920
Set Height 1080
Set Padding 48
Set Margin 0
Set Framerate 30
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"
Set WindowBar "Colorful"
Set WindowBarSize 32
Set BorderRadius 0

Hide
Type `export HOME="$(sh demo/setup.sh)" && export PATH="$HOME/bin:$PATH" && clear`
Enter
Sleep 1500ms
Show

# ─── Screen 1: the problem ───
Type "mcp-sync status"
Enter
Sleep 6s

# ─── Screen 2: dry-run preview ───
Type "clear"
Enter
Sleep 500ms
Type "mcp-sync sync --from cursor --dry-run"
Enter
Sleep 6s

# ─── Screen 3: apply ───
Type "clear"
Enter
Sleep 500ms
Type "mcp-sync sync --from cursor"
Enter
Sleep 6s

# ─── Screen 4: all green ───
Type "clear"
Enter
Sleep 500ms
Type "mcp-sync status"
Enter
Sleep 5s

# ─── Screen 5: validate ───
Type "clear"
Enter
Sleep 500ms
Type "mcp-sync validate"
Enter
Sleep 5s

Sleep 2s
