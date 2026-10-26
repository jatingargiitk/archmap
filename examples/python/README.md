# Python Example

This example demonstrates archmap on a simple Python project structure.

## Structure

```
src/
├── api/
│   ├── __init__.py
│   └── routes.py
├── models/
│   ├── __init__.py
│   └── user.py
└── utils/
    ├── __init__.py
    └── helpers.py
```

## Run archmap

```bash
cd examples/python
npx @jatingargiitk/archmap render
```

## Expected Output

`ARCHITECTURE.md` will show:
- 3 modules: `src/api`, `src/models`, `src/utils`
- Module dependencies between them
- A Mermaid diagram visualizing the architecture
