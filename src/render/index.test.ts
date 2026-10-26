import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { renderMermaid, writeArchitectureFile, renderDeltaDiagram } from './index.js';
import type { Graph, ModuleEdge } from '../types.js';

const testDir = path.join(process.cwd(), '.test-render');

describe('renderMermaid', () => {
  it('should render a basic graph', () => {
    const graph: Graph = {
      modules: [
        {
          name: 'src/ui',
          files: ['src/ui/Button.ts'],
          fanIn: 0,
          fanOut: 1,
          externalDeps: [],
        },
        {
          name: 'src/core',
          files: ['src/core/utils.ts'],
          fanIn: 1,
          fanOut: 0,
          externalDeps: ['react'],
        },
      ],
      edges: [
        {
          from: 'src/ui',
          to: 'src/core',
          weight: 1,
          locations: [],
        },
      ],
      cycles: [],
    };

    const output = renderMermaid(graph);

    expect(output).toContain('flowchart LR');
    expect(output).toContain('src/ui');
    expect(output).toContain('src/core');
    expect(output).toContain('<!-- archmap:start -->');
    expect(output).toContain('<!-- archmap:end -->');
  });

  it('should render cycles', () => {
    const graph: Graph = {
      modules: [
        {
          name: 'A',
          files: [],
          fanIn: 1,
          fanOut: 1,
          externalDeps: [],
        },
        {
          name: 'B',
          files: [],
          fanIn: 1,
          fanOut: 1,
          externalDeps: [],
        },
      ],
      edges: [
        { from: 'A', to: 'B', weight: 1, locations: [] },
        { from: 'B', to: 'A', weight: 1, locations: [] },
      ],
      cycles: [['A', 'B']],
    };

    const output = renderMermaid(graph);

    expect(output).toContain('⚠️ Cycles Detected');
    expect(output).toContain('`A` → `B`');
  });

  it('should render module table', () => {
    const graph: Graph = {
      modules: [
        {
          name: 'src/ui',
          files: ['src/ui/Button.ts', 'src/ui/Input.ts'],
          fanIn: 0,
          fanOut: 1,
          externalDeps: ['react', 'react-dom'],
        },
      ],
      edges: [],
      cycles: [],
    };

    const output = renderMermaid(graph);

    expect(output).toContain('| Module | Files | Fan-In | Fan-Out | External Deps |');
    expect(output).toContain('`src/ui`');
    expect(output).toContain('| 2 |');
  });
});

describe('writeArchitectureFile', () => {
  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create new file if it does not exist', async () => {
    const filePath = path.join(testDir, 'ARCHITECTURE.md');
    const graph: Graph = {
      modules: [
        {
          name: 'src/ui',
          files: ['src/ui/Button.ts'],
          fanIn: 0,
          fanOut: 0,
          externalDeps: [],
        },
      ],
      edges: [],
      cycles: [],
    };

    await writeArchitectureFile(filePath, graph);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('# Architecture');
    expect(content).toContain('<!-- archmap:start -->');
  });

  it('should preserve content outside markers', async () => {
    const filePath = path.join(testDir, 'ARCHITECTURE.md');
    const initialContent = `# My Project\n\nSome intro text\n\n<!-- archmap:start -->\nOld content\n<!-- archmap:end -->\n\nSome footer text`;

    await fs.writeFile(filePath, initialContent, 'utf-8');

    const graph: Graph = {
      modules: [
        {
          name: 'src/ui',
          files: [],
          fanIn: 0,
          fanOut: 0,
          externalDeps: [],
        },
      ],
      edges: [],
      cycles: [],
    };

    await writeArchitectureFile(filePath, graph);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('Some intro text');
    expect(content).toContain('Some footer text');
    expect(content).not.toContain('Old content');
    expect(content).toContain('## Module Dependencies');
  });
});

describe('renderDeltaDiagram', () => {
  it('should render added and removed edges', () => {
    const addedEdges: ModuleEdge[] = [
      { from: 'A', to: 'B', weight: 1, locations: [] },
    ];

    const removedEdges: ModuleEdge[] = [
      { from: 'C', to: 'D', weight: 1, locations: [] },
    ];

    const touchedModules = new Set(['A', 'B', 'C', 'D']);

    const output = renderDeltaDiagram(addedEdges, removedEdges, touchedModules);

    expect(output).toContain('```mermaid');
    expect(output).toContain('flowchart LR');
    expect(output).toContain('A[A]');
    expect(output).toContain('====>');
    expect(output).toContain('-.->');
  });
});
