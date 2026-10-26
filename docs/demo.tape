Output docs/demo.gif

Set FontSize 13
Set Width 1000
Set Height 550
Set TypingSpeed 40ms
Set Theme "Dracula"

Type "cd /tmp/archmap-demo"
Enter
Sleep 300ms

Type "# Current violation: ui → db"
Enter
Type "cat src/ui/Button.ts"
Enter
Sleep 1.2s

Type ""
Enter
Type "# archmap check detects it"
Enter
Type "/workspace/dist/cli.js check"
Enter
Sleep 1.5s

Type ""
Enter
Type "# Show the diff with file:line"
Enter
Type "/workspace/dist/cli.js diff"
Enter
Sleep 2s

Type ""
Enter
Type "# Accept the new edge"
Enter
Type "/workspace/dist/cli.js accept"
Enter
Sleep 1s

Type ""
Enter
Type "# Now check passes ✅"
Enter
Type "/workspace/dist/cli.js check"
Enter
Sleep 1s
