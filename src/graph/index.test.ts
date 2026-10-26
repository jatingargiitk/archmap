import { describe, it, expect } from 'vitest';
import { buildGraph, detectCycles } from './index.js';
import type { ResolvedImport, ModuleEdge } from '../types.js';

describe('buildGraph', () => {
  it('should collapse files into modules', () => {
    const imports: ResolvedImport[] = [
      {
        from: 'src/ui/Button.ts',
        to: 'src/core/utils.ts',
        location: { file: 'src/ui/Button.ts', line: 1, column: 0 },
      },
    ];

    const allFiles = ['src/ui/Button.ts', 'src/core/utils.ts'];

    const graph = buildGraph(imports, allFiles, { roots: ['src'], depth: 1 });

    expect(graph.modules).toHaveLength(2);
    expect(graph.modules.map(m => m.name)).toContain('src/ui');
    expect(graph.modules.map(m => m.name)).toContain('src/core');
  });

  it('should compute fan-in and fan-out', () => {
    const imports: ResolvedImport[] = [
      {
        from: 'src/ui/Button.ts',
        to: 'src/core/utils.ts',
        location: { file: 'src/ui/Button.ts', line: 1, column: 0 },
      },
      {
        from: 'src/ui/Input.ts',
        to: 'src/core/utils.ts',
        location: { file: 'src/ui/Input.ts', line: 1, column: 0 },
      },
    ];

    const allFiles = ['src/ui/Button.ts', 'src/ui/Input.ts', 'src/core/utils.ts'];

    const graph = buildGraph(imports, allFiles, { roots: ['src'], depth: 1 });

    const coreModule = graph.modules.find(m => m.name === 'src/core');
    const uiModule = graph.modules.find(m => m.name === 'src/ui');

    expect(coreModule?.fanIn).toBe(1);
    expect(uiModule?.fanOut).toBe(1);
  });

  it('should compute edge weights', () => {
    const imports: ResolvedImport[] = [
      {
        from: 'src/ui/Button.ts',
        to: 'src/core/utils.ts',
        location: { file: 'src/ui/Button.ts', line: 1, column: 0 },
      },
      {
        from: 'src/ui/Input.ts',
        to: 'src/core/utils.ts',
        location: { file: 'src/ui/Input.ts', line: 1, column: 0 },
      },
    ];

    const allFiles = ['src/ui/Button.ts', 'src/ui/Input.ts', 'src/core/utils.ts'];

    const graph = buildGraph(imports, allFiles, { roots: ['src'], depth: 1 });

    const edge = graph.edges.find(e => e.from === 'src/ui' && e.to === 'src/core');
    expect(edge?.weight).toBe(2);
  });

  it('should ignore self-imports', () => {
    const imports: ResolvedImport[] = [
      {
        from: 'src/ui/Button.ts',
        to: 'src/ui/Input.ts',
        location: { file: 'src/ui/Button.ts', line: 1, column: 0 },
      },
    ];

    const allFiles = ['src/ui/Button.ts', 'src/ui/Input.ts'];

    const graph = buildGraph(imports, allFiles, { roots: ['src'], depth: 1 });

    expect(graph.edges).toHaveLength(0);
  });

  it('should handle workspace packages', () => {
    const imports: ResolvedImport[] = [
      {
        from: 'packages/ui/src/Button.ts',
        to: 'packages/core/src/utils.ts',
        location: { file: 'packages/ui/src/Button.ts', line: 1, column: 0 },
      },
    ];

    const allFiles = ['packages/ui/src/Button.ts', 'packages/core/src/utils.ts'];

    const graph = buildGraph(imports, allFiles, { roots: ['packages/*'], depth: 0 });

    expect(graph.modules).toHaveLength(2);
    expect(graph.modules.map(m => m.name)).toContain('packages/ui');
    expect(graph.modules.map(m => m.name)).toContain('packages/core');
  });
});

describe('detectCycles', () => {
  it('should detect simple cycles', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'A',
        to: 'B',
        weight: 1,
        locations: [],
      },
      {
        from: 'B',
        to: 'A',
        weight: 1,
        locations: [],
      },
    ];

    const cycles = detectCycles(edges, ['A', 'B']);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toContain('A');
    expect(cycles[0]).toContain('B');
  });

  it('should detect complex cycles', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'A',
        to: 'B',
        weight: 1,
        locations: [],
      },
      {
        from: 'B',
        to: 'C',
        weight: 1,
        locations: [],
      },
      {
        from: 'C',
        to: 'A',
        weight: 1,
        locations: [],
      },
    ];

    const cycles = detectCycles(edges, ['A', 'B', 'C']);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(3);
  });

  it('should not detect cycles in DAG', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'A',
        to: 'B',
        weight: 1,
        locations: [],
      },
      {
        from: 'B',
        to: 'C',
        weight: 1,
        locations: [],
      },
    ];

    const cycles = detectCycles(edges, ['A', 'B', 'C']);

    expect(cycles).toHaveLength(0);
  });

  it('should detect multiple separate cycles', () => {
    const edges: ModuleEdge[] = [
      {
        from: 'A',
        to: 'B',
        weight: 1,
        locations: [],
      },
      {
        from: 'B',
        to: 'A',
        weight: 1,
        locations: [],
      },
      {
        from: 'C',
        to: 'D',
        weight: 1,
        locations: [],
      },
      {
        from: 'D',
        to: 'C',
        weight: 1,
        locations: [],
      },
    ];

    const cycles = detectCycles(edges, ['A', 'B', 'C', 'D']);

    expect(cycles).toHaveLength(2);
  });
});
