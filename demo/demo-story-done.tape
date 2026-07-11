Output demo/story/term-done.mp4

Set Shell "bash"
Set FontSize 38
Set FontFamily "Menlo"
Set Width 1920
Set Height 1080
Set Padding 28
Set Margin 0
Set Framerate 30
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"
Set WindowBar "Colorful"
Set WindowBarSize 40
Set BorderRadius 0

Hide
Type `export HOME="$(sh demo/setup.sh)" && export PATH="$HOME/bin:$PATH" && mcp-sync sync --from cursor >/dev/null && clear`
Enter
Sleep 1s
Show

Type "mcp-sync status"
Enter
Sleep 6s

Type "mcp-sync validate"
Enter
Sleep 5s
