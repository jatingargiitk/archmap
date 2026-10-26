import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { graphToLock, writeLockFile, readLockFile, diffLocks } from './index.js';
import type { Graph, LockFile } from '../types.js';

const testDir = path.join(process.cwd(), '.test-lock');

describe('graphToLock', () => {
  it('should convert graph to lock format', () => {
    const graph: Graph = {
      modules: [
        {
          name: 'src/ui',
          files: ['src/ui/Button.ts'],
          fanIn: 0,
          fanOut: 1,
          externalDeps: ['react'],
        },
        {
          name: 'src/core',
          files: ['src/core/utils.ts'],
          fanIn: 1,
          fanOut: 0,
          externalDeps: [],
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

    const lock = graphToLock(graph);

    expect(lock.version).toBe('1');
    expect(lock.modules).toContain('src/ui');
    expect(lock.modules).toContain('src/core');
    expect(lock.edges).toHaveLength(1);
    expect(lock.edges[0].from).toBe('src/ui');
    expect(lock.edges[0].to).toBe('src/core');
    expect(lock.externalDeps['src/ui']).toEqual(['react']);
  });

  it('should sort modules and edges deterministically', () => {
    const graph: Graph = {
      modules: [
        { name: 'z', files: [], fanIn: 0, fanOut: 0, externalDeps: [] },
        { name: 'a', files: [], fanIn: 0, fanOut: 0, externalDeps: [] },
      ],
      edges: [
        { from: 'z', to: 'a', weight: 1, locations: [] },
        { from: 'a', to: 'z', weight: 1, locations: [] },
      ],
      cycles: [],
    };

    const lock = graphToLock(graph);

    expect(lock.modules[0]).toBe('a');
    expect(lock.modules[1]).toBe('z');
    expect(lock.edges[0].from).toBe('a');
  });
});

describe('writeLockFile and readLockFile', () => {
  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should write and read lock file', async () => {
    const lock: LockFile = {
      version: '1',
      modules: ['src/ui', 'src/core'],
      edges: [
        { from: 'src/ui', to: 'src/core', weight: 1 },
      ],
      externalDeps: {},
    };

    const filePath = path.join(testDir, 'archmap.lock.json');
    await writeLockFile(filePath, lock);

    const readBack = await readLockFile(filePath);

    expect(readBack).toEqual(lock);
  });

  it('should return null if file does not exist', async () => {
    const filePath = path.join(testDir, 'nonexistent.json');
    const result = await readLockFile(filePath);
    expect(result).toBeNull();
  });
});

describe('diffLocks', () => {
  it('should detect added edges', () => {
    const oldLock: LockFile = {
      version: '1',
      modules: ['A', 'B'],
      edges: [],
      externalDeps: {},
    };

    const newLock: LockFile = {
      version: '1',
      modules: ['A', 'B'],
      edges: [
        { from: 'A', to: 'B', weight: 1 },
      ],
      externalDeps: {},
    };

    const diff = diffLocks(oldLock, newLock);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].from).toBe('A');
    expect(diff.added[0].to).toBe('B');
    expect(diff.removed).toHaveLength(0);
  });

  it('should detect removed edges', () => {
    const oldLock: LockFile = {
      version: '1',
      modules: ['A', 'B'],
      edges: [
        { from: 'A', to: 'B', weight: 1 },
      ],
      externalDeps: {},
    };

    const newLock: LockFile = {
      version: '1',
      modules: ['A', 'B'],
      edges: [],
      externalDeps: {},
    };

    const diff = diffLocks(oldLock, newLock);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].from).toBe('A');
    expect(diff.removed[0].to).toBe('B');
  });

  it('should handle null old lock', () => {
    const newLock: LockFile = {
      version: '1',
      modules: ['A', 'B'],
      edges: [
        { from: 'A', to: 'B', weight: 1 },
      ],
      externalDeps: {},
    };

    const diff = diffLocks(null, newLock);

    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  it('should detect new cycles', () => {
    const oldLock: LockFile = {
      version: '1',
      modules: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'B', weight: 1 },
      ],
      externalDeps: {},
    };

    const newLock: LockFile = {
      version: '1',
      modules: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'B', weight: 1 },
        { from: 'B', to: 'A', weight: 1 },
        { from: 'C', to: 'C', weight: 1 },
      ],
      externalDeps: {},
    };

    const diff = diffLocks(oldLock, newLock);

    expect(diff.newCycles).toHaveLength(1);
    expect(diff.newCycles[0]).toContain('A');
    expect(diff.newCycles[0]).toContain('B');
  });
});
