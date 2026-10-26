# Architecture

<!-- archmap:start -->

## Module Dependencies

```mermaid
flowchart LR
  src_action_ts[src/action.ts] --> src_graph[src/graph]
  src_action_ts[src/action.ts] --> src_lock[src/lock]
  src_action_ts[src/action.ts] --> src_parser[src/parser]
  src_action_ts[src/action.ts] --> src_render[src/render]
  src_action_ts[src/action.ts] --> src_resolver[src/resolver]
  src_action_ts[src/action.ts] --> src_rules[src/rules]
  src_action_ts[src/action.ts] --> src_types_ts[src/types.ts]
  src_cli[src/cli] --> src_graph[src/graph]
  src_cli[src/cli] --> src_lock[src/lock]
  src_cli[src/cli] --> src_parser[src/parser]
  src_cli[src/cli] --> src_render[src/render]
  src_cli[src/cli] --> src_resolver[src/resolver]
  src_cli[src/cli] --> src_rules[src/rules]
  src_cli[src/cli] --> src_types_ts[src/types.ts]
  src_cli_ts[src/cli.ts] --> src_cli[src/cli]
  src_graph[src/graph] --> src_types_ts[src/types.ts]
  src_lock[src/lock] --> src_types_ts[src/types.ts]
  src_parser[src/parser] |2| --> |2| src_types_ts[src/types.ts]
  src_render[src/render] --> src_types_ts[src/types.ts]
  src_resolver[src/resolver] --> src_types_ts[src/types.ts]
  src_rules[src/rules] --> src_types_ts[src/types.ts]
```

## Modules

| Module | Files | Fan-In | Fan-Out | External Deps |
|--------|-------|--------|---------|---------------|
| `src/cli` | 1 | 1 | 7 | - |
| `src/types.ts` | 1 | 8 | 0 | - |
| `src/action.ts` | 1 | 0 | 7 | - |
| `src/graph` | 1 | 2 | 1 | - |
| `src/lock` | 1 | 2 | 1 | - |
| `src/parser` | 4 | 2 | 1 | - |
| `src/render` | 1 | 2 | 1 | - |
| `src/resolver` | 1 | 2 | 1 | - |
| `src/rules` | 1 | 2 | 1 | - |
| `src/cli.ts` | 1 | 0 | 1 | - |
| `src/index.ts` | 1 | 0 | 0 | - |

<!-- archmap:end -->