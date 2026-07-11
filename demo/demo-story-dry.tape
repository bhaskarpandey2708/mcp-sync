Output demo/story/term-dryrun.mp4

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
Type `export HOME="$(sh demo/setup.sh)" && export PATH="$HOME/bin:$PATH" && clear`
Enter
Sleep 800ms
Show

Type "mcp-sync sync --from cursor --dry-run"
Enter
Sleep 8s
