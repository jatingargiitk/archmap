import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { extractTypeScriptImports, extractPythonImports } from './parser/index.js';
import { resolveImports, loadTsConfig, findWorkspaces } from './resolver/index.js';
import { buildGraph } from './graph/index.js';
import { writeArchitectureFile, renderDeltaDiagram } from './render/index.js';
import { graphToLock, writeLockFile, diffLocks } from './lock/index.js';
import { checkRules, shouldFailCheck } from './rules/index.js';
import type { Config } from './types.js';

async function runAction(): Promise<void> {
  const githubContext = getGitHubContext();
  const rootDir = process.env.GITHUB_WORKSPACE || process.cwd();

  console.log('🔍 Analyzing architecture...');

  const config = await loadConfig(rootDir);
  const currentGraph = await analyzeRepo(rootDir, config);
  const currentLock = graphToLock(currentGraph);

  await writeArchitectureFile(
    path.join(rootDir, 'ARCHITECTURE.md'),
    currentGraph
  );

  await writeLockFile(path.join(rootDir, 'archmap.lock.json'), currentLock);

  if (githubContext.eventName === 'pull_request') {
    await handlePullRequest(rootDir, currentGraph, currentLock, config, githubContext);
  } else if (githubContext.eventName === 'push') {
    await handlePush(rootDir, githubContext);
  }
}

async function handlePullRequest(
  rootDir: string,
  currentGraph: any,
  currentLock: any,
  config: Config,
  context: any
): Promise<void> {
  console.log('📊 Computing diff...');

  let baseLock = null;
  try {
    const baseLockContent = execSync(
      `git show origin/${context.baseRef}:archmap.lock.json`,
      { cwd: rootDir, encoding: 'utf-8' }
    );
    baseLock = JSON.parse(baseLockContent);
  } catch {
    console.log('⚠️  No lock file found in base branch');
  }

  const diff = diffLocks(baseLock, currentLock, currentGraph);
  const violations = checkRules(currentGraph.edges, config);

  const commentBody = buildCommentBody(diff, violations, currentGraph);

  if (process.env.GITHUB_TOKEN && context.prNumber) {
    await postOrUpdateComment(context, commentBody);
  } else {
    console.log('Comment preview:');
    console.log(commentBody);
  }

  const shouldFail = shouldFailCheck(diff, violations, config);

  if (shouldFail) {
    console.log('❌ Check failed');
    process.exit(1);
  } else {
    console.log('✅ Check passed');
  }
}

async function handlePush(rootDir: string, context: any): Promise<void> {
  if (context.ref === `refs/heads/${context.defaultBranch}`) {
    console.log('🔄 Committing updated architecture files...');

    try {
      execSync('git config user.name "archmap[bot]"', { cwd: rootDir });
      execSync('git config user.email "archmap[bot]@users.noreply.github.com"', { cwd: rootDir });
      execSync('git add ARCHITECTURE.md archmap.lock.json', { cwd: rootDir });
      
      try {
        execSync('git commit -m "chore: update architecture map [skip ci]"', { cwd: rootDir });
        execSync(`git push origin ${context.defaultBranch}`, { cwd: rootDir });
        console.log('✅ Architecture files updated');
      } catch {
        console.log('ℹ️  No changes to commit');
      }
    } catch (error: any) {
      console.log('⚠️  Could not commit changes:', error.message);
    }
  }
}

function buildCommentBody(diff: any, violations: any[], _graph: any): string {
  const lines: string[] = [];

  lines.push('## 🗺️ archmap');
  lines.push('');

  const summary = `**${diff.added.length > 0 ? '+' : ''}${diff.added.length} new edge${diff.added.length !== 1 ? 's' : ''}, ${diff.removed.length > 0 ? '-' : ''}${diff.removed.length} removed**`;
  lines.push(summary);
  lines.push('');

  if (violations.length > 0) {
    lines.push('### ⚠️ Rule Violations');
    lines.push('');
    for (const violation of violations) {
      lines.push(`- ${violation.message}`);
      lines.push(`  - Rule: \`${violation.rule}\``);
    }
    lines.push('');
  }

  if (diff.added.length > 0 || diff.removed.length > 0) {
    const touchedModules = new Set<string>();
    for (const edge of diff.added) {
      touchedModules.add(edge.from);
      touchedModules.add(edge.to);
    }
    for (const edge of diff.removed) {
      touchedModules.add(edge.from);
      touchedModules.add(edge.to);
    }

    lines.push('### Changes');
    lines.push('');
    lines.push(renderDeltaDiagram(diff.added, diff.removed, touchedModules));
    lines.push('');

    if (diff.added.length > 0) {
      lines.push('#### Added Dependencies');
      lines.push('');
      for (const edge of diff.added) {
        // Show locations (B6)
        if (edge.locations && edge.locations.length > 0) {
          const loc = edge.locations[0];
          lines.push(`- \`${edge.from}\` → \`${edge.to}\` ([${loc.file}:${loc.line}](${loc.file}#L${loc.line}))`);
        } else {
          lines.push(`- \`${edge.from}\` → \`${edge.to}\``);
        }
      }
      lines.push('');
    }

    if (diff.removed.length > 0) {
      lines.push('#### Removed Dependencies');
      lines.push('');
      for (const edge of diff.removed) {
        lines.push(`- \`${edge.from}\` → \`${edge.to}\``);
      }
      lines.push('');
    }
  }

  if (diff.newCycles.length > 0) {
    lines.push('### ⚠️ New Cycles');
    lines.push('');
    for (const cycle of diff.newCycles) {
      lines.push(`- ${cycle.map((m: string) => `\`${m}\``).join(' → ')}`);
    }
    lines.push('');
  }

  if (diff.added.length === 0 && diff.removed.length === 0 && violations.length === 0) {
    lines.push('✅ No architectural changes detected');
  } else {
    lines.push('---');
    lines.push('');
    lines.push('To accept these changes, run:');
    lines.push('```bash');
    lines.push('npx @jatingargiitk/archmap accept');
    lines.push('git add ARCHITECTURE.md archmap.lock.json');
    lines.push('git commit -m "chore: update architecture map"');
    lines.push('```');
  }

  lines.push('');
  lines.push('<!-- archmap-comment -->');

  return lines.join('\n');
}

async function postOrUpdateComment(context: any, body: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const [owner, repo] = context.repository.split('/');
  const issueNumber = context.prNumber;

  try {
    const existingComments = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'archmap',
        },
      }
    );

    const comments = (await existingComments.json()) as any[];
    const existingComment = comments.find((c: any) =>
      c.body.includes('<!-- archmap-comment -->')
    );

    if (existingComment) {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'archmap',
          },
          body: JSON.stringify({ body }),
        }
      );
      console.log('✅ Updated existing comment');
    } else {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'archmap',
          },
          body: JSON.stringify({ body }),
        }
      );
      console.log('✅ Posted new comment');
    }
  } catch (error: any) {
    console.log('⚠️  Could not post comment:', error.message);
  }
}

function getGitHubContext(): any {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let event = {};

  if (eventPath) {
    try {
      const eventData = readFileSync(eventPath, 'utf-8');
      event = JSON.parse(eventData);
    } catch {
      // Ignore
    }
  }

  return {
    eventName: process.env.GITHUB_EVENT_NAME || '',
    repository: process.env.GITHUB_REPOSITORY || '',
    ref: process.env.GITHUB_REF || '',
    sha: process.env.GITHUB_SHA || '',
    actor: process.env.GITHUB_ACTOR || '',
    workflow: process.env.GITHUB_WORKFLOW || '',
    defaultBranch: (event as any).repository?.default_branch || 'main',
    baseRef: (event as any).pull_request?.base?.ref || 'main',
    prNumber: (event as any).pull_request?.number,
  };
}

async function analyzeRepo(rootDir: string, config: Config): Promise<any> {
  const files = await findSourceFiles(rootDir, config.ignore || []);

  const allImports = [];
  const allFiles: string[] = [];

  for (const file of files) {
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

  const moduleConfig = config.modules || {};
  const graph = buildGraph(resolved, allFiles, moduleConfig);

  return graph;
}

async function findSourceFiles(rootDir: string, ignore: string[]): Promise<string[]> {
  const files: string[] = [];
  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
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

runAction().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
