# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-26

### Fixed
- **CRITICAL:** `archmap init` now generates a workflow that uses `jatingargiitk/archmap@v0` GitHub Action instead of running `npx @jatingargiitk/archmap render` followed by `npx @jatingargiitk/archmap check || true`
  - Previous workflow ran `render` before `check`, which rewrote the lock file on every run, making `check` unable to detect unapproved changes
  - `|| true` hid all failures, preventing PRs from being flagged
  - New workflow properly uses the GitHub Action for PR comments and gate mode
- Added test to verify generated workflow content

## [0.1.0] - 2026-10-26

### Added
- Initial release
- Lockfile-based architecture snapshot testing
- CLI commands: `render`, `diff`, `check`, `accept`, `init`
- GitHub Action for PR comments with sticky diff
- Support for TypeScript/JavaScript (ESM + CJS) and Python
- Module dependency graph visualization with Mermaid
- Deny rules for architectural boundaries
- Default ignores for node_modules, dist, build, .gitignore parsing
- File:line location tracking in diffs and PR comments
- Gate mode for failing CI on unapproved changes
- Self-contained GitHub Action with bundled dist/

### Fixed
- CLI check command now always fails on unapproved edges
- Deny rule globs (e.g., `ui/**`) now match module names correctly
- ESM TypeScript imports (`.js`/`.mjs`/`.cjs` → `.ts`/`.tsx`/`.mts`/`.cts`) now resolve properly
