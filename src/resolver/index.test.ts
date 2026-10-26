import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { resolveImports, loadTsConfig, findWorkspaces } from './index.js';
import type { FileImports } from '../types.js';

const testDir = path.join(process.cwd(), '.test-resolver');

async function createTestFile(filePath: string, content = ''): Promise<void> {
  const fullPath = path.join(testDir, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

describe('resolveImports', () => {
  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should resolve relative imports', async () => {
    await createTestFile('src/foo.ts');
    await createTestFile('src/bar.ts');

    const fileImports: FileImports[] = [
      {
        file: 'src/foo.ts',
        imports: [
          {
            from: './bar',
            location: { file: 'src/foo.ts', line: 1, column: 0 },
          },
        ],
      },
    ];

    const resolved = await resolveImports(fileImports, { rootDir: testDir });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].from).toBe('src/foo.ts');
    expect(resolved[0].to).toBe('src/bar.ts');
  });

  it('should resolve index files', async () => {
    await createTestFile('src/utils/index.ts');

    const fileImports: FileImports[] = [
      {
        file: 'src/foo.ts',
        imports: [
          {
            from: './utils',
            location: { file: 'src/foo.ts', line: 1, column: 0 },
          },
        ],
      },
    ];

    const resolved = await resolveImports(fileImports, { rootDir: testDir });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].to).toBe('src/utils/index.ts');
  });

  it('should filter out external modules', async () => {
    const fileImports: FileImports[] = [
      {
        file: 'src/foo.ts',
        imports: [
          {
            from: 'react',
            location: { file: 'src/foo.ts', line: 1, column: 0 },
          },
        ],
      },
    ];

    const resolved = await resolveImports(fileImports, { rootDir: testDir });

    expect(resolved).toHaveLength(0);
  });

  it('should resolve Python relative imports', async () => {
    await createTestFile('src/foo.py');
    await createTestFile('src/__init__.py');

    const fileImports: FileImports[] = [
      {
        file: 'src/foo.py',
        imports: [
          {
            from: '.',
            location: { file: 'src/foo.py', line: 1, column: 0 },
          },
        ],
      },
    ];

    const resolved = await resolveImports(fileImports, { rootDir: testDir });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].to).toBe('src/__init__.py');
  });
});

describe('loadTsConfig', () => {
  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should load tsconfig paths', async () => {
    const tsconfig = {
      compilerOptions: {
        baseUrl: './src',
        paths: {
          '@/*': ['*'],
        },
      },
    };

    await fs.writeFile(
      path.join(testDir, 'tsconfig.json'),
      JSON.stringify(tsconfig),
      'utf-8'
    );

    const config = await loadTsConfig(testDir);

    expect(config).not.toBeNull();
    expect(config?.baseUrl).toBe('./src');
    expect(config?.paths).toEqual({ '@/*': ['*'] });
  });

  it('should return null if tsconfig does not exist', async () => {
    const config = await loadTsConfig(testDir);
    expect(config).toBeNull();
  });
});

describe('findWorkspaces', () => {
  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should find workspaces from package.json', async () => {
    const pkg = {
      workspaces: ['packages/*'],
    };

    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify(pkg),
      'utf-8'
    );

    await createTestFile('packages/foo/package.json', JSON.stringify({ name: 'foo' }));
    await createTestFile('packages/bar/package.json', JSON.stringify({ name: 'bar' }));

    const workspaces = await findWorkspaces(testDir);

    expect(workspaces).toContain('packages/foo');
    expect(workspaces).toContain('packages/bar');
  });

  it('should return empty array if no workspaces', async () => {
    const workspaces = await findWorkspaces(testDir);
    expect(workspaces).toEqual([]);
  });
});
