# vhs demo tape — render with: vhs demo/demo.tape (from the repo root)
Output demo/demo.gif

Set FontSize 17
Set Width 1100
Set Height 640
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type `export HOME="$(sh demo/setup.sh)" && export PATH="$HOME/bin:$PATH" && clear`
Enter
Sleep 1s
Show

Type "mcp-sync status"
Enter
Sleep 3.5s

Type "mcp-sync sync --from cursor --dry-run"
Enter
Sleep 3.5s

Type "mcp-sync sync --from cursor"
Enter
Sleep 3s

Type "mcp-sync status"
Enter
Sleep 4s
