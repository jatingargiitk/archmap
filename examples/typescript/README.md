# TypeScript Example

This example demonstrates archmap on a simple TypeScript project structure.

## Structure

```
src/
├── ui/
│   ├── Button.ts
│   └── Input.ts
├── services/
│   ├── api.ts
│   └── auth.ts
└── utils/
    └── helpers.ts
```

## Run archmap

```bash
cd examples/typescript
npx @jatingargiitk/archmap render
```

## Expected Output

`ARCHITECTURE.md` will show:
- 3 modules: `src/ui`, `src/services`, `src/utils`
- Module dependencies between them
- A Mermaid diagram visualizing the architecture
