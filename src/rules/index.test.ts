import { describe, it, expect } from 'vitest';
import { checkRules, shouldFailCheck } from './index.js';
import type { ModuleEdge, Config, GraphDiff } from '../types.js';

describe('checkRules', () => {
  it('should detect deny rule violations with nested paths', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'ui/Button',
        to: 'db/users',
        weight: 1,
        locations: [],
      },
    ];

    const config: Config = {
      rules: [
        {
          deny: {
            from: 'ui/**',
            to: 'db/**',
          },
        },
      ],
    };

    const violations = checkRules(edges, config);

    expect(violations).toHaveLength(1);
    expect(violations[0].edge.from).toBe('ui/Button');
    expect(violations[0].edge.to).toBe('db/users');
  });

  it('should match deny rules against module names without trailing slash (B2 regression)', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'src/ui',
        to: 'src/db',
        weight: 1,
        locations: [],
      },
    ];

    const config: Config = {
      rules: [
        {
          deny: {
            from: 'src/ui/**',
            to: 'src/db/**',
          },
        },
      ],
    };

    const violations = checkRules(edges, config);

    expect(violations).toHaveLength(1);
    expect(violations[0].edge.from).toBe('src/ui');
    expect(violations[0].edge.to).toBe('src/db');
  });

  it('should match README example: ui/** pattern matches src/ui module', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'src/ui',
        to: 'src/db',
        weight: 1,
        locations: [],
      },
    ];

    // Exact pattern from README
    const config: Config = {
      rules: [
        {
          deny: {
            from: 'ui/**',
            to: 'db/**',
          },
        },
      ],
    };

    const violations = checkRules(edges, config);

    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('src/ui');
    expect(violations[0].message).toContain('src/db');
  });

  it('should allow edges that do not violate rules', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'ui/Button',
        to: 'utils/helpers',
        weight: 1,
        locations: [],
      },
    ];

    const config: Config = {
      rules: [
        {
          deny: {
            from: 'ui/**',
            to: 'db/**',
          },
        },
      ],
    };

    const violations = checkRules(edges, config);

    expect(violations).toHaveLength(0);
  });

  it('should handle multiple deny rules', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'ui/Button',
        to: 'db/users',
        weight: 1,
        locations: [],
      },
      {
        from: 'api/routes',
        to: 'ui/Button',
        weight: 1,
        locations: [],
      },
    ];

    const config: Config = {
      rules: [
        {
          deny: {
            from: 'ui/**',
            to: 'db/**',
          },
        },
        {
          deny: {
            from: 'api/**',
            to: 'ui/**',
          },
        },
      ],
    };

    const violations = checkRules(edges, config);

    expect(violations).toHaveLength(2);
  });

  it('should handle exact module names', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'ui',
        to: 'db',
        weight: 1,
        locations: [],
      },
    ];

    const config: Config = {
      rules: [
        {
          deny: {
            from: 'ui',
            to: 'db',
          },
        },
      ],
    };

    const violations = checkRules(edges, config);

    expect(violations).toHaveLength(1);
  });
});

describe('shouldFailCheck', () => {
  it('should fail in gate mode with added edges', () => {
    const diff: GraphDiff = {
      added: [{ from: 'A', to: 'B', weight: 1, locations: [] }],
      removed: [],
      newCycles: [],
    };

    const config: Config = {
      mode: 'gate',
    };

    expect(shouldFailCheck(diff, [], config)).toBe(true);
  });

  it('should not fail in comment mode with added edges', () => {
    const diff: GraphDiff = {
      added: [{ from: 'A', to: 'B', weight: 1, locations: [] }],
      removed: [],
      newCycles: [],
    };

    const config: Config = {
      mode: 'comment',
    };

    expect(shouldFailCheck(diff, [], config)).toBe(false);
  });

  it('should fail with rule violations', () => {
    const diff: GraphDiff = {
      added: [],
      removed: [],
      newCycles: [],
    };

    const violations = [
      {
        rule: 'test',
        edge: { from: 'A', to: 'B', weight: 1, locations: [] },
        message: 'test violation',
      },
    ];

    const config: Config = {};

    expect(shouldFailCheck(diff, violations, config)).toBe(true);
  });
});
