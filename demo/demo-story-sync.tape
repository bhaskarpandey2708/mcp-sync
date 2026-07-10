Output demo/story/term-sync.mp4

Set Shell "bash"
Set FontSize 44
Set FontFamily "Menlo"
Set Width 1920
Set Height 1080
Set Padding 56
Set Margin 0
Set Framerate 30
Set TypingSpeed 40ms
Set Theme "Catppuccin Mocha"
Set WindowBar "Colorful"
Set WindowBarSize 36
Set BorderRadius 0

Hide
# Start from drifted fixture, then apply
Type `export HOME="$(sh demo/setup.sh)" && export PATH="$HOME/bin:$PATH" && clear`
Enter
Sleep 800ms
Show

Type "mcp-sync sync --from cursor"
Enter
Sleep 7s
