import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { extractTypeScriptImports, extractPythonImports } from '../parser/index.js';
import { resolveImports, loadTsConfig, findWorkspaces } from '../resolver/index.js';
import { buildGraph } from '../graph/index.js';
import { writeArchitectureFile } from '../render/index.js';
import { graphToLock, writeLockFile, readLockFile, diffLocks } from '../lock/index.js';
import { checkRules } from '../rules/index.js';
import type { Config } from '../types.js';

export async function runCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'render';

  const rootDir = process.cwd();

  switch (command) {
    case 'render':
      await renderCommand(rootDir);
      break;
    case 'diff':
      await diffCommand(rootDir, args);
      break;
    case 'check':
      await checkCommand(rootDir);
      break;
    case 'accept':
      await acceptCommand(rootDir);
      break;
    case 'init':
      await initCommand(rootDir);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(`Usage: archmap [command]

Commands:
  render          Generate ARCHITECTURE.md and archmap.lock.json
  diff [--base]   Show diff against base branch (default: main)
  check           Check for unapproved changes
  accept          Accept current changes and update lock
  init            Initialize archmap in this repository
`);
      process.exit(0);
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(`Usage: archmap [command]

Commands:
  render          Generate ARCHITECTURE.md and archmap.lock.json
  diff [--base]   Show diff against base branch (default: main)
  check           Check for unapproved changes
  accept          Accept current changes and update lock
  init            Initialize archmap in this repository
`);
      process.exit(1);
  }
}

async function renderCommand(rootDir: string): Promise<void> {
  console.log('🔍 Analyzing architecture...');
  
  const graph = await analyzeRepo(rootDir);
  
  await writeArchitectureFile(
    path.join(rootDir, 'ARCHITECTURE.md'),
    graph
  );
  
  const lock = graphToLock(graph);
  await writeLockFile(path.join(rootDir, 'archmap.lock.json'), lock);
  
  console.log('✅ Generated ARCHITECTURE.md and archmap.lock.json');
  console.log(`   ${graph.modules.length} modules, ${graph.edges.length} edges`);
  
  if (graph.cycles.length > 0) {
    console.log(`   ⚠️  ${graph.cycles.length} cycle(s) detected`);
  }
}

async function diffCommand(rootDir: string, args: string[]): Promise<void> {
  const baseArg = args.indexOf('--base');
  const base = baseArg !== -1 && args[baseArg + 1] ? args[baseArg + 1] : 'main';
  
  console.log(`📊 Computing diff against ${base}...`);
  
  const currentGraph = await analyzeRepo(rootDir);
  const currentLock = graphToLock(currentGraph);
  
  let baseLock = await readLockFile(path.join(rootDir, 'archmap.lock.json'));
  
  if (!baseLock) {
    try {
      const baseLockContent = execSync(
        `git show ${base}:archmap.lock.json`,
        { cwd: rootDir, encoding: 'utf-8' }
      );
      baseLock = JSON.parse(baseLockContent);
    } catch {
      console.log(`⚠️  No lock file found in ${base} branch`);
      baseLock = null;
    }
  }
  
  const diff = diffLocks(baseLock, currentLock, currentGraph);
  
  console.log('\nChanges:');
  console.log(`  +${diff.added.length} new edges`);
  console.log(`  -${diff.removed.length} removed edges`);
  
  if (diff.added.length > 0) {
    console.log('\nAdded edges:');
    for (const edge of diff.added) {
      // Show locations (B6)
      const locationStr = edge.locations.length > 0 
        ? ` (${edge.locations[0].file}:${edge.locations[0].line})`
        : '';
      console.log(`  + ${edge.from} → ${edge.to}${locationStr}`);
    }
  }
  
  if (diff.removed.length > 0) {
    console.log('\nRemoved edges:');
    for (const edge of diff.removed) {
      console.log(`  - ${edge.from} → ${edge.to}`);
    }
  }
  
  if (diff.newCycles.length > 0) {
    console.log(`\n⚠️  ${diff.newCycles.length} new cycle(s) detected:`);
    for (const cycle of diff.newCycles) {
      console.log(`  ${cycle.join(' → ')}`);
    }
  }
}

async function checkCommand(rootDir: string): Promise<void> {
  console.log('🔍 Checking for unapproved changes...');
  
  const config = await loadConfig(rootDir);
  const currentGraph = await analyzeRepo(rootDir);
  const currentLock = graphToLock(currentGraph);
  
  const committedLock = await readLockFile(path.join(rootDir, 'archmap.lock.json'));
  
  if (!committedLock) {
    console.log('❌ No lock file found. Run `archmap accept` to create one.');
    process.exit(1);
  }
  
  const diff = diffLocks(committedLock, currentLock, currentGraph);
  const violations = checkRules(currentGraph.edges, config);
  
  if (violations.length > 0) {
    console.log('❌ Rule violations detected:');
    for (const violation of violations) {
      console.log(`   ${violation.message}`);
      console.log(`   Rule: ${violation.rule}`);
    }
    process.exit(1);
  }
  
  // CLI check always fails on unapproved changes, regardless of mode
  if (diff.added.length > 0 || diff.removed.length > 0) {
    console.log('❌ Unapproved changes detected:');
    console.log(`   +${diff.added.length} new edges, -${diff.removed.length} removed edges`);
    if (diff.added.length > 0) {
      console.log('\nAdded edges:');
      for (const edge of diff.added) {
        // Show locations (B6)
        const locationStr = edge.locations.length > 0 
          ? ` (${edge.locations[0].file}:${edge.locations[0].line})`
          : '';
        console.log(`  + ${edge.from} → ${edge.to}${locationStr}`);
      }
    }
    console.log('\nRun `archmap diff` to see details');
    console.log('Run `archmap accept` to approve these changes');
    process.exit(1);
  }
  
  console.log('✅ No unapproved changes');
}

async function acceptCommand(rootDir: string): Promise<void> {
  console.log('✅ Accepting current architecture...');
  
  const graph = await analyzeRepo(rootDir);
  
  await writeArchitectureFile(
    path.join(rootDir, 'ARCHITECTURE.md'),
    graph
  );
  
  const lock = graphToLock(graph);
  await writeLockFile(path.join(rootDir, 'archmap.lock.json'), lock);
  
  console.log('✅ Updated ARCHITECTURE.md and archmap.lock.json');
  console.log('   Remember to commit these changes');
}

async function initCommand(rootDir: string): Promise<void> {
  console.log('🚀 Initializing archmap...');
  
  const workflowDir = path.join(rootDir, '.github', 'workflows');
  await fs.mkdir(workflowDir, { recursive: true });
  
  const workflowPath = path.join(workflowDir, 'archmap.yml');
  
  const workflow = `name: archmap

on:
  pull_request:

permissions:
  contents: write
  pull-requests: write

jobs:
  archmap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: jatingargiitk/archmap@v0
`;
  
  await fs.writeFile(workflowPath, workflow, 'utf-8');
  
  await renderCommand(rootDir);
  
  console.log('✅ archmap initialized!');
  console.log('   Created:');
  console.log('   - .github/workflows/archmap.yml');
  console.log('   - ARCHITECTURE.md');
  console.log('   - archmap.lock.json');
  console.log('\n   Next steps:');
  console.log('   1. Review the generated files');
  console.log('   2. Commit them to your repository');
  console.log('   3. The GitHub Action will run on every PR');
}

async function analyzeRepo(rootDir: string): Promise<any> {
  const config = await loadConfig(rootDir);
  
  const files = await findSourceFiles(rootDir, config.ignore || []);
  
  // Filter files to only those in module roots (B4)
  const moduleConfig = config.modules || {};
  const roots = moduleConfig.roots || ['src', 'packages/*', 'apps/*'];
  const filteredFiles = files.filter(file => matchesAnyRoot(file, roots));
  
  const allImports = [];
  const allFiles: string[] = [];
  
  for (const file of filteredFiles) {
    const fullPath = path.join(rootDir, file);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    let imports;
    if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      imports = await extractTypeScriptImports(file, content);
    } else if (file.endsWith('.py')) {
      imports = await extractPythonImports(file, content);
    } else {
      continue;
    }
    
    allImports.push(imports);
    allFiles.push(file);
  }
  
  const tsconfig = await loadTsConfig(rootDir);
  const workspaces = await findWorkspaces(rootDir);
  
  const resolved = await resolveImports(allImports, {
    rootDir,
    tsconfig: tsconfig || undefined,
    workspaces: workspaces.length > 0 ? workspaces : undefined,
  });
  
  const graph = buildGraph(resolved, allFiles, moduleConfig);
  
  return graph;
}

function matchesAnyRoot(file: string, roots: string[]): boolean {
  const normalized = file.replace(/\\/g, '/');
  
  for (const root of roots) {
    if (root.endsWith('/*')) {
      const base = root.slice(0, -2);
      if (normalized.startsWith(base + '/')) {
        return true;
      }
    } else {
      if (normalized.startsWith(root + '/') || normalized === root) {
        return true;
      }
    }
  }
  
  return false;
}

async function findSourceFiles(rootDir: string, ignore: string[]): Promise<string[]> {
  const files: string[] = [];
  
  // Load .gitignore patterns (B4)
  const gitignorePatterns = await loadGitignore(rootDir);
  
  const ignorePatterns = [
    'node_modules',
    'node_modules/**',
    '**/node_modules/**',
    'dist',
    'dist/**',
    '**/dist/**',
    'build',
    'build/**',
    '**/build/**',
    '.git',
    '.git/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    // Ignore root-level config files (B4)
    '*.config.*',
    '*.json',
    '*.md',
    '*.yml',
    '*.yaml',
    '.eslintrc.*',
    '.gitignore',
    'LICENSE',
    ...gitignorePatterns,
    ...ignore,
  ];
  
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (isSourceFile(entry.name)) {
          files.push(relativePath);
        }
      }
    }
  }
  
  await walk(rootDir);
  return files;
}

async function loadGitignore(rootDir: string): Promise<string[]> {
  try {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => {
        // Convert gitignore patterns to glob patterns
        if (pattern.endsWith('/')) {
          return pattern.slice(0, -1) + '/**';
        }
        return pattern;
      });
  } catch {
    return [];
  }
}

function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  
  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(normalized)) {
      return true;
    }
  }
  
  return false;
}

function patternToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*');
  
  return new RegExp(`^${regexStr}$`);
}

function isSourceFile(name: string): boolean {
  return /\.(ts|tsx|js|jsx|py)$/.test(name);
}

async function loadConfig(rootDir: string): Promise<Config> {
  const configPath = path.join(rootDir, 'archmap.yml');
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const yaml = await import('js-yaml');
    return yaml.load(content) as Config;
  } catch {
    return {};
  }
}
