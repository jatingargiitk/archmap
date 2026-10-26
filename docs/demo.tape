Output docs/demo.gif

Set FontSize 13
Set Width 1000
Set Height 550
Set TypingSpeed 40ms
Set Theme "Dracula"

Type "cd /tmp/archmap-demo"
Enter
Sleep 500ms

Type "# New cross-module import added"
Enter
Type "cat src/ui/Button.ts"
Enter
Sleep 1s

Type ""
Enter
Type "# archmap check fails (exit 1)"
Enter
Type "npx @jatingargiitk/archmap check"
Enter
Sleep 2s

Type ""
Enter
Type "# Shows file:line locations"
Enter
Type "npx @jatingargiitk/archmap diff"
Enter
Sleep 2s

Type ""
Enter
Type "# Accept the architectural change"
Enter
Type "npx @jatingargiitk/archmap accept"
Enter
Sleep 1.5s

Type ""
Enter
Type "# Now check passes ✅"
Enter
Type "npx @jatingargiitk/archmap check"
Enter
Sleep 1.5s
