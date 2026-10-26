# Contributing to archmap

## Development

```bash
git clone https://github.com/jatingargiitk/archmap
cd archmap
npm install
npm test
npm run build
```

## Publishing (for maintainers)

```bash
# 1. Ensure tests pass and everything is committed
npm test
npm run build

# 2. Update version in package.json (if not already done)
npm version patch  # or minor, or major

# 3. Login to npm (one time)
npm login

# 4. Publish to npm with provenance
npm publish --access public --provenance

# 5. Create GitHub release
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes "Initial release"
```

## Regenerating the Demo GIF

The demo GIF is recorded with [VHS](https://github.com/charmbracelet/vhs). To regenerate:

```bash
# Install dependencies
# - vhs: https://github.com/charmbracelet/vhs
# - ttyd: https://github.com/tsl0922/ttyd

# Record the demo
vhs docs/demo.tape

# Output: docs/demo.gif (~700KB)
```

The demo shows:
1. A cross-module import violation (`ui → db`)
2. `archmap check` detecting the unapproved edge
3. `archmap diff` showing the new dependency with file:line
4. `archmap accept` approving the change
5. `archmap check` passing after acceptance
