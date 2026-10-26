# archmap: Architecture Map Checker

**When to use:** Before finishing any task that modifies code.

## What archmap does

archmap tracks the module-level dependency graph of a repository. When you make changes that introduce new cross-module dependencies, archmap detects them and requires explicit acceptance.

This prevents accidental architectural drift, especially from AI-written code.

## Usage

Before you finish a task and commit your changes:

1. Run the archmap check:
   ```bash
   npx @jatingargiitk/archmap check
   ```

2. If the check passes: proceed with committing your changes.

3. If the check fails with "unapproved changes":
   - Run `npx @jatingargiitk/archmap diff` to see what changed
   - Review the new module dependencies you introduced
   - If they are intentional and acceptable:
     ```bash
     npx @jatingargiitk/archmap accept
     git add ARCHITECTURE.md archmap.lock.json
     ```
   - Include these files in your commit

## What to tell the user

If you added a new module dependency, mention it in your summary:

> "I added a dependency from \`ui/\` to \`services/api\` to fetch user data. The architecture map has been updated and included in this commit."

## When NOT to use

- If the repository does not have an `archmap.lock.json` file (archmap is not set up)
- If you only modified files within a single module (no new cross-module imports)

## Installation

If archmap is not installed in the repository:

```bash
npx @jatingargiitk/archmap init
```

This creates:
- `.github/workflows/archmap.yml` - GitHub Action
- `ARCHITECTURE.md` - Living architecture map
- `archmap.lock.json` - Dependency lockfile
